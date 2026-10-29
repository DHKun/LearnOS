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
  test("导航进入路线图，节点显示每门课的状态；学完第一门后路线图和推荐随之更新", async ({ page }) => {
    test.setTimeout(120_000);
    const student = await createTestStudent("paths");
    const first = await getCourseBySlug("bits-and-bytes");

    try {
      await login(page, student.email, student.password);
      await page.goto("/courses");

      // The path shows all five stops, every one of them live.
      const pathCard = page.locator('[data-path="computer-foundations"]');
      await expect(pathCard.getByRole("heading", { name: "计算机基础入门" })).toBeVisible();
      await expect(pathCard.locator("[data-step]")).toHaveCount(7);
      await expect(pathCard.locator('[data-step="bits-and-bytes"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-step="how-programs-run"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-step="data-structures"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-step="networking-basics"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-step="command-line"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-step="git-basics"]')).toHaveAttribute("data-state", "available");
      await expect(pathCard.locator('[data-state="upcoming"]')).toHaveCount(0);
      await expect(pathCard.getByTestId("path-progress")).toContainText("已完成 0 / 7 门");
      await expect(pathCard.getByRole("link", { name: /开始：0 和 1 的世界/ })).toBeVisible();

      // The nav leads to the path list and then to the path's flow chart.
      await page.getByRole("navigation").first().getByRole("link", { name: "路线", exact: true }).click();
      await expect(page).toHaveURL(/\/paths$/);
      await page.locator('[data-path="computer-foundations"]').getByRole("link", { name: /查看路线图/ }).click();
      await expect(page).toHaveURL(/\/paths\/computer-foundations$/);
      const map = page.getByTestId("path-map");
      await expect(page.getByRole("heading", { level: 1, name: "计算机基础入门" })).toBeVisible();
      await expect(map.locator("[data-step]")).toHaveCount(7);
      await expect(map.locator('[data-step="bits-and-bytes"]')).toContainText("推荐下一门");
      await expect(map.locator('[data-step="git-basics"]')).toHaveAttribute("data-state", "available");
      await expect(page.getByTestId("path-finish")).toHaveAttribute("data-done", "false");

      // The course page knows where it sits on the path, and links back to the map.
      await map.locator('[data-step="bits-and-bytes"]').getByRole("link", { name: /查看课程/ }).click();
      await expect(page).toHaveURL(/\/courses\/bits-and-bytes$/);
      await expect(page.getByTestId("course-path-context")).toContainText("第 1 / 7 门");
      await expect(page.getByTestId("course-path-context")).toContainText("下一门：程序是怎么跑起来的");
      await expect(page.getByTestId("course-path-context").getByRole("link", { name: /计算机基础入门/ })).toHaveAttribute("href", "/paths/computer-foundations");

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
      await page.getByRole("link", { name: /路线下一门：程序是怎么跑起来的/ }).click();
      await expect(page).toHaveURL(/\/courses\/how-programs-run/);
      await expect(page.getByTestId("course-path-context")).toContainText("第 2 / 7 门");

      // The catalog reflects the progress and recommends the next stop.
      await page.goto("/courses");
      await expect(pathCard.locator('[data-step="bits-and-bytes"]')).toHaveAttribute("data-state", "completed");
      await expect(pathCard.getByTestId("path-progress")).toContainText("已完成 1 / 7 门");
      await expect(pathCard.getByRole("link", { name: /开始：程序是怎么跑起来的/ })).toBeVisible();

      // So does the flow chart: the first stop is done, the second is next.
      await page.goto("/paths/computer-foundations");
      await expect(map.locator('[data-step="bits-and-bytes"]')).toHaveAttribute("data-state", "completed");
      await expect(map.locator('[data-step="bits-and-bytes"]')).toContainText("复习课程");
      await expect(map.locator('[data-step="how-programs-run"]')).toContainText("推荐下一门");
      await expect(page.getByTestId("path-progress")).toContainText("已完成 1 / 7 门");

      // Unknown paths are a 404, not an empty page.
      const missing = await page.goto("/paths/no-such-path");
      expect(missing?.status()).toBe(404);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
