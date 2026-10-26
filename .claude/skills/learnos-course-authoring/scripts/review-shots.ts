/**
 * Screenshot every chapter of a course for manual review, and report
 * horizontal overflow. Run from the repository root against a running app:
 *
 *   pnpm exec tsx .claude/skills/learnos-course-authoring/scripts/review-shots.ts \
 *     --course my-course --email student@example.com --password '…' \
 *     [--base http://127.0.0.1:3000] [--out /tmp/shots] [--widths 1440,390] \
 *     [--themes light,dark] [--channel chrome]
 *
 * Needs LEARNOS_DB_URL (to list the course's lessons) and a student account.
 * The student is enrolled in the course if not already; an active enrollment
 * in another course makes the script stop rather than abandon it.
 *
 * Output per chapter, width and theme: a full-page PNG plus one PNG per
 * concept animation and simulation lab of the course.
 */
import fs from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";
import { Client } from "pg";

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (value === undefined) {
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return value;
}

const course = arg("course");
const email = arg("email");
const password = arg("password");
const base = arg("base", process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000");
const out = arg("out", path.join(process.cwd(), "test-results", `review-${course}`));
const widths = arg("widths", "1440,390").split(",").map(Number);
const themes = arg("themes", "light,dark").split(",") as ("light" | "dark")[];
const channel = process.argv.includes("--channel") ? arg("channel") : undefined;

async function lessons() {
  const client = new Client({ connectionString: process.env.LEARNOS_DB_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query<{ course_id: string; id: string; slug: string; position: number }>(
      `select c.id as course_id, l.id, l.slug, l.position
         from public.courses c join public.lessons l on l.course_id = c.id
        where c.slug = $1 order by l.position`,
      [course],
    );
    if (result.rows.length === 0) throw new Error(`course ${course} not found; run pnpm courses:sync first`);
    return result.rows;
  } finally {
    await client.end();
  }
}

async function main() {
  const rows = await lessons();
  const courseId = rows[0].course_id;
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch(channel ? { channel } : {});
  const report: string[] = [];
  try {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: { width: widths[0], height: 900 } });
      await context.addInitScript((value) => {
        try {
          localStorage.setItem("learnos-theme", value);
        } catch {
          // ignore
        }
      }, theme);
      const page = await context.newPage();
      await page.goto(`${base}/login`);
      await page.getByLabel("邮箱").fill(email);
      await page.getByLabel("密码").fill(password);
      await page.getByRole("button", { name: "登录", exact: true }).click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20_000 });

      const enrolled = await page.evaluate(async (id) => {
        const response = await fetch("/api/enrollments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: id }),
        });
        return { status: response.status, body: await response.text() };
      }, courseId);
      if (enrolled.status === 409) {
        throw new Error(`student has another active course; use a fresh account (${enrolled.body})`);
      }

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        for (const lesson of rows) {
          await page.goto(`${base}/learn/${courseId}?lesson=${lesson.id}`);
          await page.locator("main main h1").first().waitFor({ timeout: 20_000 });
          await page.waitForTimeout(1500);
          const name = `${String(lesson.position + 1).padStart(2, "0")}-${lesson.slug}-${width}-${theme}`;
          await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });

          const overflow = await page.evaluate(() => {
            const root = document.documentElement;
            const content = document.querySelector("main main");
            const right = content?.getBoundingClientRect().right ?? root.clientWidth;
            const offenders = Array.from(document.querySelectorAll("[data-concept-id], [data-testid]"))
              .filter((element) => element.getBoundingClientRect().right > right + 1)
              .map((element) => element.getAttribute("data-concept-id") ?? element.getAttribute("data-testid"));
            return { page: root.scrollWidth > root.clientWidth + 1, offenders };
          });
          if (overflow.page || overflow.offenders.length) {
            report.push(`${name}: page overflow=${overflow.page} offenders=${overflow.offenders.join(",")}`);
          }

          // Keep the sticky header and the floating notes button out of
          // element screenshots; the next navigation drops this style.
          await page.addStyleTag({
            content: 'header { position: static !important; } [data-testid="notes-toggle"] { display: none !important; }',
          });
          const blocks = page.locator(`[data-concept-id^="${course}/"], [data-testid^="${course}-"]`);
          for (let index = 0; index < (await blocks.count()); index += 1) {
            const block = blocks.nth(index);
            const id =
              (await block.getAttribute("data-concept-id")) ?? (await block.getAttribute("data-testid")) ?? `block-${index}`;
            await block.screenshot({ path: path.join(out, `${name}--${id.replace(/[^a-z0-9-]+/gi, "_")}.png`) });
          }
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`screenshots: ${out}`);
  console.log(report.length ? `overflow:\n${report.join("\n")}` : "overflow: none");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
