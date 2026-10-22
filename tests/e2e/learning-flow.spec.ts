import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getEvents,
  getPointsTotal,
  login,
} from "./helpers";

const QUIZ_FILE = path.join(
  process.cwd(),
  "content/courses/sql-injection-basics/quiz.server.json",
);

type QuizFile = {
  questions: { id: string; answer: string | string[] }[];
};

test.describe("学生完整学习闭环（SQL 注入课程）", () => {
  test("报名 → 图文 → 服务端验证实验 → 测验 → 结课 → 积分 → 管理员可见", async ({
    page,
    browser,
  }) => {
    const student = await createTestStudent("flow");
    const course = await getCourseBySlug("sql-injection-basics");

    try {
      await login(page, student.email, student.password);
      await expect(page).toHaveURL(/\/courses/);

      await page.goto("/courses/sql-injection-basics");
      await expect(page.getByRole("heading", { name: "SQL 注入：从字符串拼接到参数化查询" })).toBeVisible();
      await page.getByRole("button", { name: "参加课程" }).click();

      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });
      await expect(page.getByRole("heading", { name: "注入从哪里来" }).first()).toBeVisible();

      // Article 1
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByRole("button", { name: "本章已完成" })).toBeVisible({ timeout: 20_000 });

      // Article 2
      await page.getByRole("link", { name: /参数化查询为什么有效/ }).click();
      await expect(page.getByRole("heading", { name: "参数化查询为什么有效" })).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByRole("button", { name: "本章已完成" })).toBeVisible({ timeout: 20_000 });

      // Interactive lab in an isolated iframe
      await page.getByRole("link", { name: /实验：审计一条登录查询/ }).click();
      const lab = page.frameLocator('iframe[title^="交互实验"]');
      await expect(lab.getByRole("heading", { name: "登录查询审计台" })).toBeVisible({
        timeout: 30_000,
      });

      await lab
        .locator("label.defence", { hasText: "使用参数化查询" })
        .locator('input[type="checkbox"]')
        .check();
      await lab.getByRole("button", { name: "运行安全审计" }).click();
      await lab.getByRole("button", { name: "提交审计结论" }).click();
      await expect(lab.getByText("登录查询已阻止全部注入载荷", { exact: false })).toBeVisible({
        timeout: 20_000,
      });

      await page.waitForTimeout(400);
      const enrollment = (await getEnrollments(student.id))[0];
      const events = await getEvents(enrollment.id);
      const auditEvent = events.find((event) => event.event_type === "audit_run");
      expect(auditEvent).toBeTruthy();
      expect(auditEvent?.payload.defences).toContain("parameterize");

      // Final quiz — answers come from the server-only fixture file.
      await page.getByRole("link", { name: /最终测验/ }).click();
      await expect(page.getByRole("heading", { name: "最终测验" })).toBeVisible();

      const quiz = JSON.parse(fs.readFileSync(QUIZ_FILE, "utf8")) as QuizFile;
      for (const question of quiz.questions) {
        const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
        for (const answer of answers) {
          await page
            .locator(`[data-question-id="${question.id}"] input[value="${answer}"]`)
            .check();
        }
      }
      await page.getByRole("button", { name: "提交测验" }).click();
      await expect(page.getByText("测验通过，章节已完成")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("课程已完成，当前为只读复习模式")).toBeVisible({
        timeout: 20_000,
      });

      // Points: 3 lessons ×10 + final quiz 10 + final exam 50 = 90
      await page.goto("/me");
      await expect(page.getByText("90", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();
      expect(await getPointsTotal(student.id)).toBe(90);

      // Admin view of the same student
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");
      await expect(adminPage).toHaveURL(/\/admin/);

      await adminPage.goto(`/admin/students?student=${student.id}`);
      await expect(adminPage.getByRole("dialog").getByText(student.name)).toBeVisible({
        timeout: 20_000,
      });
      await expect(adminPage.getByRole("dialog").getByText("已完成").first()).toBeVisible();

      await adminPage.goto(`/admin/courses/${course.id}`);
      const row = adminPage.getByRole("row", { name: new RegExp(student.name) });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row.getByText("已完成")).toBeVisible();

      await adminContext.close();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});

const RETRY_QUIZ_FILE = path.join(
  process.cwd(),
  "content/courses/idempotent-retries/quiz.server.json",
);

test.describe("学生完整学习闭环（重试与幂等课程）", () => {
  test("第二门课程：图文 → 幂等实验 → 测验 → 结课", async ({ page }) => {
    const student = await createTestStudent("retry-flow");
    const course = await getCourseBySlug("idempotent-retries");

    try {
      await login(page, student.email, student.password);
      await page.goto("/courses/idempotent-retries");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByRole("button", { name: "本章已完成" })).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("link", { name: /幂等键与去重存储/ }).click();
      await expect(page.getByRole("heading", { name: "幂等键与去重存储" })).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByRole("button", { name: "本章已完成" })).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("link", { name: /实验：让支付恰好发生一次/ }).click();
      const lab = page.frameLocator('iframe[title^="交互实验"]');
      await expect(lab.getByRole("heading", { name: "恰好一次支付" })).toBeVisible({
        timeout: 30_000,
      });

      await lab.getByRole("radio", { name: /^按业务操作生成稳定键/ }).check();
      await lab.getByRole("radio", { name: /^重试复用同一个键/ }).check();
      await lab.locator("#dedupe").check();
      await lab.locator("#max-retries").fill("3");
      await lab.getByRole("button", { name: "运行支付重试模拟" }).click();
      await lab.getByRole("button", { name: "提交策略" }).click();
      await expect(lab.getByText("重试全部复用同一个幂等键")).toBeVisible({ timeout: 20_000 });
      await expect(lab.getByText("✓ 服务端已验证")).toBeVisible();

      await page.getByRole("link", { name: /最终测验/ }).click();
      await expect(page.getByRole("heading", { name: "最终测验" })).toBeVisible();

      const quiz = JSON.parse(fs.readFileSync(RETRY_QUIZ_FILE, "utf8")) as QuizFile;
      for (const question of quiz.questions) {
        const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
        for (const answer of answers) {
          await page
            .locator(`[data-question-id="${question.id}"] input[value="${answer}"]`)
            .check();
        }
      }
      await page.getByRole("button", { name: "提交测验" }).click();
      await expect(page.getByText("测验通过，章节已完成")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText("课程已完成，当前为只读复习模式")).toBeVisible({
        timeout: 20_000,
      });

      await page.goto("/me");
      expect(await getPointsTotal(student.id)).toBe(90);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
