import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

async function savedConceptStep(page: Page, blockId: string): Promise<number> {
  return page.evaluate(async (id) => {
    const lessonId = new URL(window.location.href).searchParams.get("lesson");
    if (!lessonId) return -1;
    const response = await (await fetch(`/api/learning/states/${lessonId}`)).json();
    const state = response?.data?.state;
    const block = state?.blocks?.[id];
    return typeof block?.conceptStep === "number"
      ? block.conceptStep
      : typeof state?.conceptStep === "number"
        ? state.conceptStep
        : -1;
  }, blockId);
}

test.describe("概念动画", () => {
  test("URL 概念可播放、单步、重播、展开类比边界并刷新恢复", async ({ page }) => {
    const student = await createTestStudent("concept-url");
    const course = await getCourseBySlug("http-hands-on");

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`));
      await page.getByRole("link", { name: /URL：哪些部分会到达服务器/ }).first().click();

      const concept = page.locator('[data-concept-id="http-hands-on/url"]');
      await expect(concept).toBeVisible({ timeout: 20_000 });
      await concept.getByRole("button", { name: "播放动画" }).click();
      await expect(concept.getByRole("button", { name: "暂停动画" })).toBeVisible();
      await concept.getByRole("button", { name: "暂停动画" }).click();
      await concept.getByRole("button", { name: "下一步" }).click();
      await expect(concept.getByText(/2 \/ 6/)).toBeVisible();
      await concept.getByRole("button", { name: "重新播放" }).click();
      await expect(concept.getByText(/1 \/ 6/)).toBeVisible();
      await concept.getByText("类比边界与真实系统映射").click();
      await expect(concept.getByText("真实对象")).toBeVisible();

      await concept.getByRole("button", { name: "下一步" }).click();
      await expect.poll(() => savedConceptStep(page, "url-anatomy"), { timeout: 20_000 }).toBe(1);
      await page.reload();
      const restored = page.locator('[data-concept-id="http-hands-on/url"]');
      await expect(restored).toBeVisible({ timeout: 20_000 });
      await expect(restored.getByText(/2 \/ 6/)).toBeVisible();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
