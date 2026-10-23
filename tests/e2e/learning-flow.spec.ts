import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  api,
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
      await expect(page.getByText("本章已完成").first()).toBeVisible({ timeout: 20_000 });

      // Article 2
      await page.getByRole("link", { name: /参数化查询为什么有效/ }).first().click();
      await expect(page.getByRole("heading", { name: "参数化查询为什么有效" })).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByText("本章已完成").first()).toBeVisible({ timeout: 20_000 });

      // Interactive activity runs natively in the course page
      await page.getByRole("link", { name: /实验：审计一条登录查询/ }).first().click();
      const activity = page.getByTestId("sql-activity");
      await expect(activity).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("iframe")).toHaveCount(0);

      await activity
        .getByRole("checkbox", { name: /使用参数化查询/ })
        .check();
      await activity.getByRole("button", { name: "运行安全审计" }).click();
      await expect(activity.getByText("实验状态已保存")).toBeVisible({ timeout: 20_000 });

      await page.reload();
      const restored = page.getByTestId("sql-activity");
      await expect(restored).toBeVisible({ timeout: 20_000 });
      await expect(
        restored.getByRole("checkbox", { name: /使用参数化查询/ }),
      ).toBeChecked();
      await expect(restored.getByText("已阻止", { exact: false }).first()).toBeVisible();

      await restored.getByRole("button", { name: "提交审计结论" }).click();
      await expect(
        activity.getByText("登录查询已阻止全部注入载荷", { exact: false }),
      ).toBeVisible({ timeout: 20_000 });

      await page.waitForTimeout(400);
      const enrollment = (await getEnrollments(student.id))[0];
      const events = await getEvents(enrollment.id);
      const auditEvent = events.find((event) => event.event_type === "audit_run");
      expect(auditEvent).toBeTruthy();
      expect(auditEvent?.payload.defences).toContain("parameterize");

      // Final quiz — answers come from the server-only fixture file.
      await page.getByRole("link", { name: /最终测验/ }).first().click();
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
      await page.getByRole("button", { name: "提交知识检查" }).click();
      await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });
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

      await adminPage.goto(`/admin/students/${student.id}`);
      await expect(adminPage.getByRole("heading", { name: student.name })).toBeVisible({
        timeout: 20_000,
      });
      await adminPage.getByRole("tab", { name: "成绩与积分" }).click();
      await expect(adminPage.getByText("已完成").first()).toBeVisible();

      const detail = await api<{
        recentEvents: { type: string; payload: Record<string, unknown> }[];
      }>(adminPage, `/api/admin/students/${student.id}`);
      expect(detail.status).toBe(200);
      expect(
        detail.body?.data?.recentEvents.some(
          (event) =>
            event.type === "audit_run" &&
            Array.isArray(event.payload.defences) &&
            event.payload.defences.includes("parameterize"),
        ),
      ).toBe(true);

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
      await expect(page.getByText("本章已完成").first()).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("link", { name: /幂等键与去重存储/ }).first().click();
      await expect(page.getByRole("heading", { name: "幂等键与去重存储" })).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByText("本章已完成").first()).toBeVisible({
        timeout: 20_000,
      });

      await page.getByRole("link", { name: /实验：让支付恰好发生一次/ }).first().click();
      const activity = page.getByTestId("idempotency-activity");
      await expect(activity).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("iframe")).toHaveCount(0);

      await activity.getByRole("radio", { name: /^按业务操作生成稳定键/ }).check();
      await activity.getByRole("radio", { name: /^重试复用同一个键/ }).check();
      await activity.getByRole("checkbox", { name: /启用服务端键去重表/ }).check();
      await activity.getByLabel("重试预算").fill("3");
      await activity.getByRole("button", { name: "运行支付重试模拟" }).click();
      await activity.getByRole("button", { name: "提交策略" }).click();
      await expect(activity.getByText("重试全部复用同一个幂等键")).toBeVisible({ timeout: 20_000 });
      await expect(activity.getByText("服务端验证通过")).toBeVisible();

      await page.getByRole("link", { name: /最终测验/ }).first().click();
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
      await page.getByRole("button", { name: "提交知识检查" }).click();
      await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });
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
