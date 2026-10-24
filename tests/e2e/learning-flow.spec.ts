import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  completeRequiredChapters,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  getPointsTotal,
  login,
  query,
} from "./helpers";

const FINAL_QUIZ_FILE = path.join(
  process.cwd(),
  "content/courses/http-fundamentals/assessments/final.server.json",
);

type QuizFile = {
  questions: { id: string; answer: string | string[] }[];
};

test.describe("学生完整学习闭环（HTTP 从零到会用）", () => {
  test("报名 → 图文 → 服务端验证实验 → 结业测验 → 结课 → 积分 → 管理员可见", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const student = await createTestStudent("flow");
    const course = await getCourseBySlug("http-fundamentals");

    try {
      await login(page, student.email, student.password);
      await expect(page).toHaveURL(/\/courses/);

      await page.goto(`/courses/${course.slug}`);
      await expect(
        page.getByRole("heading", { name: "HTTP 从零到会用：浏览器网络交互实战" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });
      await expect(
        page.getByRole("heading", { name: "互联网中的浏览器与服务器" }).first(),
      ).toBeVisible();

      // 第一章节：纯图文，手动完成。
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByText("本章已完成").first()).toBeVisible({ timeout: 20_000 });

      // 请求报文：真实浏览器内实验 + 服务端验证。
      const lessons = await getLessons(course.id);
      const requestLesson = lessons.find((lesson) => lesson.slug === "request")!;
      await page.getByRole("link", { name: /请求报文：告诉服务器你要什么/ }).first().click();
      await expect(page.getByTestId("http-fundamentals-request")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.locator("iframe")).toHaveCount(0);

      await page.getByLabel("请求实验 请求路径").fill("/api/books/2");
      await page.getByRole("button", { name: "提交实验结论" }).click();
      await expect(page.getByText("服务端验证通过")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });

      const enrollment = (await getEnrollments(student.id))[0];
      // 其余必修章节通过同一组服务端事务完成，保留最后一章给 UI 结业测验。
      await completeRequiredChapters(student.id, course.id, enrollment.id);

      const finalLesson = lessons.find((lesson) => lesson.slug === "final")!;
      await page.goto(`/learn/${course.id}?lesson=${finalLesson.id}`);
      await expect(
        page.getByRole("heading", { name: "总结与结业测验" }).first(),
      ).toBeVisible({ timeout: 20_000 });

      const quiz = JSON.parse(fs.readFileSync(FINAL_QUIZ_FILE, "utf8")) as QuizFile;
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

      // 15 × 10 + 结业测验 50 = 200
      const enrollments = await getEnrollments(student.id);
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].status).toBe("completed");
      const progress = await query<{ lesson_id: string; status: string }>(
        "select lesson_id,status from public.lesson_progress where enrollment_id=$1",
        [enrollment.id],
      );
      expect(progress.filter((item) => item.status === "completed")).toHaveLength(
        lessons.length,
      );
      expect(await getPointsTotal(student.id)).toBe(200);

      await page.goto("/me");
      await expect(page.getByText("200", { exact: true }).first()).toBeVisible();
      await expect(page.getByText("已完成", { exact: true }).first()).toBeVisible();

      // 管理员能看到同一学生的课程记录。
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();
      await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");
      await adminPage.goto(`/admin/students/${student.id}`);
      await expect(adminPage.getByRole("heading", { name: student.name })).toBeVisible({
        timeout: 20_000,
      });
      await adminPage.getByRole("tab", { name: "成绩与积分" }).click();
      await expect(adminPage.getByText("已完成").first()).toBeVisible();
      await adminPage.goto(`/admin/courses/${course.id}`);
      const row = adminPage.getByRole("row", { name: new RegExp(student.name) });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row.getByText("已完成")).toBeVisible();
      await adminContext.close();

      expect(requestLesson.id).toBeTruthy();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
