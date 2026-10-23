import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();

// Local/private targets must bypass host-level proxies.
for (const key of ["NO_PROXY", "no_proxy"]) {
  process.env[key] = [process.env[key], "10.66.66.2", "127.0.0.1"].filter(Boolean).join(",");
}

const bundledLibs = path.join(process.cwd(), ".pwlibs");
if (fs.existsSync(bundledLibs)) {
  process.env.LD_LIBRARY_PATH = [bundledLibs, process.env.LD_LIBRARY_PATH]
    .filter(Boolean)
    .join(":");
  const fontsConf = path.join(bundledLibs, "fonts.conf");
  if (fs.existsSync(fontsConf)) process.env.FONTCONFIG_FILE = fontsConf;
}

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const base = String(
  args.base ?? process.env.PERF_BASE_URL ?? "http://10.66.66.2:3000",
);
const samples = Number(args.samples ?? 3);
const label = String(args.label ?? "lag");
const cpuThrottle = Number(args.cpu ?? 1);
const networkLatency = Number(args.latency ?? 0);
const networkKbps = Number(args.kbps ?? 0);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function createStudent(tag) {
  const email = `lag-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@learnos.local`;
  const password = "Perf-Bench-2025!";
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Lag Bench" },
    app_metadata: { role: "student" },
  });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

const INIT_SCRIPT = () => {
  window.__lag = { longTasks: [], events: [] };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lag.longTasks.push({
          start: entry.startTime,
          duration: entry.duration,
        });
      }
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 16) {
          window.__lag.events.push({
            name: entry.name,
            duration: entry.duration,
            start: entry.startTime,
          });
        }
      }
    }).observe({ type: "event", buffered: true, durationThreshold: 16 });
  } catch {}
};

async function navMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const lcp = performance.getEntriesByType("largest-contentful-paint").at(-1);
    const resources = performance.getEntriesByType("resource");
    const byType = {};
    let total = 0;
    for (const entry of resources) {
      const size = entry.transferSize || 0;
      total += size;
      const type = entry.initiatorType || "other";
      byType[type] = (byType[type] || 0) + size;
    }
    const longTasks = window.__lag?.longTasks ?? [];
    return {
      ttfb: Math.round(nav?.responseStart ?? 0),
      dcl: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      load: Math.round(nav?.loadEventEnd ?? 0),
      lcp: Math.round(lcp?.startTime ?? 0),
      totalTransferKb: Math.round(total / 1024),
      jsTransferKb: Math.round((byType.script || 0) / 1024),
      cssTransferKb: Math.round((byType.link || 0) / 1024),
      longTasks: longTasks.length,
      longTaskMs: Math.round(longTasks.reduce((sum, task) => sum + task.duration, 0)),
      maxLongTaskMs: Math.round(Math.max(0, ...longTasks.map((task) => task.duration))),
    };
  });
}

async function resetLag(page) {
  await page.evaluate(() => {
    if (window.__lag) {
      window.__lag.longTasks.length = 0;
      window.__lag.events.length = 0;
    }
  });
}

async function lagSinceReset(page) {
  return page.evaluate(() => ({
    longTasks: window.__lag?.longTasks?.length ?? 0,
    longTaskMs: Math.round(
      (window.__lag?.longTasks ?? []).reduce((sum, task) => sum + task.duration, 0),
    ),
    maxLongTaskMs: Math.round(
      Math.max(0, ...(window.__lag?.longTasks ?? []).map((task) => task.duration)),
    ),
    slowEvents: (window.__lag?.events ?? [])
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5)
      .map((event) => ({
        name: event.name,
        duration: Math.round(event.duration),
      })),
  }));
}

async function scrollProfile(page) {
  return page.evaluate(async () => {
    const frames = [];
    const start = performance.now();
    const max = document.documentElement.scrollHeight - window.innerHeight;
    let y = 0;
    let last = start;
    while (y < max && performance.now() - start < 4000) {
      y += Math.max(80, Math.round(max / 40));
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const now = performance.now();
      frames.push(now - last);
      last = now;
    }
    const sorted = frames.slice().sort((a, b) => a - b);
    const pct = (p) => Math.round((sorted[Math.floor(sorted.length * p)] ?? 0) * 10) / 10;
    return {
      frames: frames.length,
      p50: pct(0.5),
      p95: pct(0.95),
      max: Math.round(Math.max(0, ...frames) * 10) / 10,
      jank: frames.filter((value) => value > 50).length,
    };
  });
}

async function runSample(browser, student, _index) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(INIT_SCRIPT);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (cpuThrottle > 1) {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuThrottle });
  }
  if (networkLatency > 0 || networkKbps > 0) {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: networkLatency,
      downloadThroughput: networkKbps > 0 ? (networkKbps * 1024) / 8 : -1,
      uploadThroughput: networkKbps > 0 ? (networkKbps * 1024) / 8 : -1,
    });
  }
  const out = {};
  try {
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.getByLabel("邮箱").fill(student.email);
    await page.getByLabel("密码").fill(student.password);
    const loginStart = Date.now();
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL("**/courses");
    out.login = Date.now() - loginStart;

    await page.goto(`${base}/courses/http-from-zero`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "参加课程" }).click();
    await page.waitForURL(/\/learn\//);
    const learnUrl = page.url();
    await page.locator("main h1").first().waitFor();
    const courseId = learnUrl.split("/learn/")[1].split("?")[0];

    // Cold-ish document load with cache warm from the join redirect.
    await resetLag(page);
    const reloadStart = Date.now();
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("main h1").first().waitFor();
    out.learnReload = Date.now() - reloadStart;
    out.learnMetrics = await navMetrics(page);
    out.learnLag = await lagSinceReset(page);

    // Manual chapter completion: API transaction + router.refresh + nav sync.
    await resetLag(page);
    const completeButton = page.getByRole("button", { name: /标记本章完成/ });
    if (await completeButton.count()) {
      const completeStart = Date.now();
      await completeButton.click();
      await page.getByTestId("chapter-completed-banner").waitFor({ state: "visible" });
      out.completeBanner = Date.now() - completeStart;
      await page
        .getByRole("navigation", { name: "课程章节" })
        .locator('[data-status="completed"]')
        .first()
        .waitFor({ timeout: 20_000 });
      out.completeNavSync = Date.now() - completeStart;
      out.completeLag = await lagSinceReset(page);
    }

    // Client-side chapter switch through the course directory.
    await resetLag(page);
    const nav = page.getByRole("navigation", { name: "课程章节" });
    const link = nav.getByRole("link").filter({ hasText: "浏览器与服务器" });
    const switchStart = Date.now();
    await link.click();
    await page.getByRole("heading", { name: "浏览器与服务器" }).waitFor();
    out.chapterSwitch = Date.now() - switchStart;
    await page.waitForTimeout(250);
    out.chapterLag = await lagSinceReset(page);

    // Open notes + type (this is the interaction users feel most).
    await resetLag(page);
    const notesStart = Date.now();
    await page.getByTestId("notes-toggle").click();
    await page.getByTestId("notes-panel").waitFor({ state: "visible" });
    out.notesOpen = Date.now() - notesStart;
    const textarea = page.getByRole("textbox", { name: "章节笔记" });
    const textStart = Date.now();
    await textarea.click();
    await textarea.pressSequentially("性能测试 note ".repeat(8), { delay: 0 });
    out.notesType = Date.now() - textStart;
    out.notesLag = await lagSinceReset(page);

    const longStart = Date.now();
    await textarea.pressSequentially("长笔记内容 ".repeat(250), { delay: 0 });
    out.notesTypeLong = Date.now() - longStart;
    out.notesLongLag = await lagSinceReset(page);
    await page.keyboard.press("Escape");

    // Quiz interaction latency.
    const quizLink = page
      .getByRole("navigation", { name: "课程章节" })
      .getByRole("link")
      .filter({ hasText: "最终测验" });
    await quizLink.click();
    await page.locator('[data-block-kind="question"]').first().waitFor();
    const radio = page.getByRole("radio").first();
    await resetLag(page);
    const clickStart = Date.now();
    await radio.check();
    await page.waitForTimeout(120);
    out.quizClick = Date.now() - clickStart;
    out.quizLag = await lagSinceReset(page);
    out.quizScroll = await scrollProfile(page);

    // Scroll the article chapter to measure paint smoothness.
    await page.goto(`${base}/learn/${courseId}`, { waitUntil: "networkidle" });
    await page.locator("main h1").first().waitFor();
    await resetLag(page);
    out.articleScroll = await scrollProfile(page);
    out.scrollLag = await lagSinceReset(page);

    out.domNodes = await page.evaluate(() => document.getElementsByTagName("*").length);
  } finally {
    await context.close();
  }
  return out;
}

function median(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return Math.round(
    (sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]) * 10,
  ) / 10;
}

function getPath(value, path) {
  return path.split(".").reduce((current, key) => (current == null ? undefined : current[key]), value);
}

function flattenPaths(value, prefix = "", out = []) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenPaths(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else if (typeof value === "number") {
    out.push(prefix);
  }
  return out;
}

function summarize(rows) {
  const paths = [...new Set(rows.flatMap((row) => flattenPaths(row)))];
  const out = {};
  for (const path of paths) {
    out[path] = median(rows.map((row) => getPath(row, path)));
  }
  return out;
}

async function main() {
  const browser = await chromium.launch();
  const warm = await createStudent("warm");
  try {
    await runSample(browser, warm, -1);
  } finally {
    await db.auth.admin.deleteUser(warm.id);
  }

  const rows = [];
  for (let index = 0; index < samples; index += 1) {
    const student = await createStudent(`s${index}`);
    try {
      rows.push(await runSample(browser, student, index));
    } finally {
      await db.auth.admin.deleteUser(student.id);
    }
  }
  await browser.close();

  const summary = summarize(rows);
  const result = { label, base, samples: rows.length, summary, rows };
  const file = path.join(process.cwd(), ".perf", `lag-${label}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ file, ...summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
