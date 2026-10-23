import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();
for (const key of ["NO_PROXY", "no_proxy"]) {
  process.env[key] = [process.env[key], "10.66.66.2"].filter(Boolean).join(",");
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
const label = String(args.label ?? `run-${new Date().toISOString().slice(0, 19)}`);
const samples = Number(args.samples ?? 3);
const base = String(
  args.base ?? process.env.PERF_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
);

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function routeBundleKb(routeKey) {
  const manifestPath = path.join(process.cwd(), ".next", "app-build-manifest.json");
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const files = manifest.pages?.[routeKey];
  if (!files) return null;
  const unique = [...new Set(files)];
  const bytes = unique.reduce((sum, file) => {
    try {
      return sum + fs.statSync(path.join(process.cwd(), ".next", file)).size;
    } catch {
      return sum;
    }
  }, 0);
  return Math.round((bytes / 1024) * 10) / 10;
}

async function createStudent(tag) {
  const email = `perf-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@learnos.local`;
  const password = "Perf-Bench-2025!";
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Perf Bench" },
    app_metadata: { role: "student" },
  });
  if (error) throw error;
  return { id: data.user.id, email, password };
}

async function measureStudent(browser, student) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const result = {};

  try {
    const loginStart = Date.now();
    await page.goto(`${base}/login`);
    await page.getByLabel("邮箱").fill(student.email);
    await page.getByLabel("密码").fill(student.password);
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL("**/courses");
    result.login = Date.now() - loginStart;

    const backStart = Date.now();
    await page.goto(`${base}/courses/http-fundamentals`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    await page.goBack();
    await page.getByRole("heading", { name: /你好/ }).waitFor();
    result.backNav = Date.now() - backStart;

    const apiStart = Date.now();
    await page.evaluate(() => fetch("/api/me").then((response) => response.json()));
    result.apiMe = Date.now() - apiStart;

    const detailStart = Date.now();
    await page.goto(`${base}/courses/http-fundamentals`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    result.courseDetail = Date.now() - detailStart;

    const joinStart = Date.now();
    await page.getByRole("button", { name: "参加课程" }).click();
    await page.waitForURL(/\/learn\//);
    await page.getByRole("heading", { name: "互联网中的浏览器与服务器" }).waitFor();
    result.joinToLearn = Date.now() - joinStart;

    const lessonStart = Date.now();
    await page.getByRole("link", { name: /URL：找到正确的资源/ }).click();
    await page.getByRole("heading", { name: "URL：找到正确的资源" }).waitFor();
    result.lessonSwitch = Date.now() - lessonStart;

    const notesReadyStart = Date.now();
    await page.locator('[data-note-ready="true"]').waitFor();
    result.notesReady = Date.now() - notesReadyStart;

    const notesStart = Date.now();
    await page.getByLabel("章节笔记").fill("性能测试笔记 1234567890");
    result.notesFill = Date.now() - notesStart;

    const labStart = Date.now();
    await page.getByRole("link", { name: /实验：审计一条登录查询/ }).click();
    await page.getByTestId("sql-activity").waitFor({ timeout: 20_000 });
    result.activityLoad = Date.now() - labStart;

    const labWarmStart = Date.now();
    await page.getByRole("link", { name: /URL：找到正确的资源/ }).click();
    await page.getByRole("heading", { name: "URL：找到正确的资源" }).waitFor();
    await page.getByRole("link", { name: /实验：审计一条登录查询/ }).click();
    await page.getByTestId("sql-activity").waitFor({ timeout: 20_000 });
    result.activityWarm = Date.now() - labWarmStart;

    const quizStart = Date.now();
    await page.getByRole("link", { name: /最终测验/ }).click();
    await page.getByText(/共 \d+ 题/).waitFor();
    result.quizLoad = Date.now() - quizStart;

    const meStart = Date.now();
    await page.goto(`${base}/me`);
    await page.getByRole("heading", { level: 1 }).waitFor();
    result.me = Date.now() - meStart;

    result.learnBundleKb = routeBundleKb("/(learning)/learn/[courseId]/page");
    result.coursesBundleKb = routeBundleKb("/(student)/courses/page");
    result.domInteractive = await page.evaluate(
      () => Math.round(performance.getEntriesByType("navigation")[0]?.domInteractive ?? 0),
    );
  } finally {
    await context.close();
  }
  return result;
}

async function measureAdmin(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const result = {};
  try {
    const start = Date.now();
    await page.goto(`${base}/login`);
    await page.getByLabel("邮箱").fill("admin@learnos.local");
    await page.getByLabel("密码").fill("LearnOS-Admin-2025!");
    await page.getByRole("button", { name: "登录" }).click();
    await page.waitForURL("**/admin");
    result.adminLogin = Date.now() - start;

    for (const [key, url, heading] of [
      ["adminOverview", "/admin", "学习概览"],
      ["adminStudents", "/admin/students", "学生管理"],
      ["adminCourses", "/admin/courses", "课程管理"],
    ]) {
      const t = Date.now();
      await page.goto(`${base}${url}`);
      await page.getByRole("heading", { name: heading }).waitFor();
      result[key] = Date.now() - t;
    }

    const courseId = await page.evaluate(async () => {
      const res = await fetch("/api/admin/courses");
      const json = await res.json();
      return json.data.items[0].id;
    });
    const t = Date.now();
    await page.goto(`${base}/admin/courses/${courseId}`);
    await page.getByText("章节结构").waitFor();
    result.adminCourseDetail = Date.now() - t;
  } finally {
    await context.close();
  }
  return result;
}

function median(values) {
  const sorted = [...values].filter((value) => typeof value === "number").sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function summarize(rows) {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  const out = {};
  for (const key of keys) {
    const values = rows.map((row) => row[key]).filter((value) => typeof value === "number");
    out[key] = values.length ? Math.round(median(values) * 10) / 10 : null;
  }
  return out;
}

function minimums(rows) {
  const keys = new Set(rows.flatMap((row) => Object.keys(row)));
  const out = {};
  for (const key of keys) {
    const values = rows.map((row) => row[key]).filter((value) => typeof value === "number");
    out[key] = values.length ? Math.round(Math.min(...values) * 10) / 10 : null;
  }
  return out;
}

async function main() {
  const browser = await chromium.launch();

  // Warm up route handlers, auth and in-memory caches before measuring.
  const warm = await createStudent("warm");
  try {
    await measureStudent(browser, warm);
    await measureAdmin(browser);
  } finally {
    await db.auth.admin.deleteUser(warm.id);
  }

  const rows = [];
  for (let index = 0; index < samples; index += 1) {
    const student = await createStudent(`s${index}`);
    try {
      const studentRow = await measureStudent(browser, student);
      const adminRow = await measureAdmin(browser);
      rows.push({ ...studentRow, ...adminRow });
    } finally {
      await db.auth.admin.deleteUser(student.id);
    }
  }

  await browser.close();

  const result = {
    label,
    timestamp: new Date().toISOString(),
    samples,
    base,
    medians: summarize(rows),
    mins: minimums(rows),
    rows,
  };

  const dir = path.join(process.cwd(), ".perf");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(result, null, 2));
  fs.appendFileSync(path.join(dir, "history.jsonl"), `${JSON.stringify(result)}\n`);

  const previousFiles = fs
    .readdirSync(dir)
    .filter(
      (file) =>
        file.endsWith(".json") &&
        file !== `${label}.json` &&
        (file.startsWith("iter") || file.startsWith("baseline")),
    )
    .map((file) => ({ file, mtime: fs.statSync(path.join(dir, file)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  let previous = null;
  if (previousFiles.length) {
    previous = JSON.parse(fs.readFileSync(path.join(dir, previousFiles[0].file), "utf8"));
  }

  console.log(`\nPerf run: ${label} (${samples} samples, median ms)`);
  for (const [key, value] of Object.entries(result.medians)) {
    const before = previous?.medians?.[key];
    const delta =
      typeof before === "number" && typeof value === "number"
        ? `${value - before >= 0 ? "+" : ""}${(value - before).toFixed(1)}`
        : "—";
    console.log(
      `${key.padEnd(20)} med=${String(value).padStart(6)} min=${String(result.mins[key] ?? "—").padStart(6)}  prev=${before ?? "—"}  ${delta}`,
    );
  }
  console.log(`\nJSON: .perf/${label}.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
