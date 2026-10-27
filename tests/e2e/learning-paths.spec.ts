import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  api,
  completeRequiredChapters,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  login,
} from "./helpers";

const FINAL_QUIZ = path.join(process.cwd(), "content/courses/bits-and-bytes/assessments/final.server.json");

test.describe("学习路线", () => {
  test("课程目录按路线展示；学完第一门后推荐路线里的下一门", async ({ page }) => {
    test.setTimeout(120_000);
    const student = await createTestStudent("paths");
    const first = await getCourseBySlug("bits-and-bytes");

    try {
      await login(page, student.email, student.password);
      await page.goto("/courses");

      // The path shows all five stops; unbuilt courses are marked as coming soon.
      const pathCard = page.locator('[data-path="computer-foundations"]');
      await expect(pathCard.getByRole("heading", { name: "计算机基础入门" })).toBeVisible();
      await expect(pathCard.locator("[data-step]")).toHaveCount(5);
      await expect(pathCard.locator('[data-step="bits-and-bytes"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-step="networking-basics"]')).toHaveAttribute("data-state", "upcoming");
      await expect(pathCard.locator('[data-step="networking-basics"] a')).toHaveCount(0);
      await expect(pathCard.getByTestId("path-progress")).toContainText("已完成 0 / 5 门");
      await expect(pathCard.getByRole("link", { name: /开始：0 和 1 的世界/ })).toBeVisible();

      // The course page knows where it sits on the path.
      await pathCard.getByRole("link", { name: /开始：0 和 1 的世界/ }).click();
      await expect(page.getByTestId("course-path-context")).toContainText("第 1 / 5 门");
      await expect(page.getByTestId("course-path-context")).toContainText("下一门：HTTP 实战");

      // Finish the course: chapters through the service transaction, the final exam through the real API.
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${first.id}`), { timeout: 20_000 });
      const enrollment = (await getEnrollments(student.id))[0];
      await completeRequiredChapters(student.id, first.id, enrollment.id);
      const finalLesson = (await getLessons(first.id)).find((lesson) => lesson.slug === "final")!;
      const quiz = JSON.parse(fs.readFileSync(FINAL_QUIZ, "utf8")) as { questions: { id: string; answer: string | string[] | boolean }[] };
      const answers = Object.fromEntries(
        quiz.questions.map((question) => [question.id, typeof question.answer === "boolean" ? String(question.answer) : question.answer]),
      );
      const submitted = await api(page, "/api/learning/blocks/submit", "POST", {
        attemptId: crypto.randomUUID(),
        enrollmentId: enrollment.id,
        lessonId: finalLesson.id,
        blockId: "final-check",
        submission: { answers },
      });
      expect(submitted.body?.data?.passed).toBe(true);
      expect((await getEnrollments(student.id))[0].status).toBe("completed");

      // The last chapter points to the next course on the path.
      await page.goto(`/learn/${first.id}?lesson=${finalLesson.id}`);
      await page.getByRole("link", { name: /路线下一门：HTTP 实战/ }).click();
      await expect(page).toHaveURL(/\/courses\/http-hands-on/);
      await expect(page.getByTestId("course-path-context")).toContainText("第 3 / 5 门");

      // The catalog reflects the progress and recommends the next stop.
      await page.goto("/courses");
      await expect(pathCard.locator('[data-step="bits-and-bytes"]')).toHaveAttribute("data-state", "completed");
      await expect(pathCard.getByTestId("path-progress")).toContainText("已完成 1 / 5 门");
      await expect(pathCard.getByRole("link", { name: /开始：HTTP 实战/ })).toBeVisible();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
