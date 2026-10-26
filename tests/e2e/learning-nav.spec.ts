import { expect, test, type Page } from "@playwright/test";

import { createTestStudent, deleteTestStudent, getCourseBySlug, getLessons, login } from "./helpers";

function unitButton(page: Page, unit: string) {
  return page
    .getByRole("navigation", { name: "课程章节" })
    .locator(`li[data-unit="${unit}"] > button`);
}

test.describe("课程目录与本章大纲", () => {
  test("单元默认收起并跟随当前章节；手动展开会被记住；大纲随滚动高亮", async ({ page }) => {
    test.setTimeout(120_000);
    const student = await createTestStudent("lesson-nav");
    const course = await getCourseBySlug("http-hands-on");
    const lessons = await getLessons(course.id);
    const lessonId = (slug: string) => lessons.find((lesson) => lesson.slug === slug)!.id;

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/learn/${course.id}?lesson=${lessonId("cache")}`);
      const nav = page.getByRole("navigation", { name: "课程章节" });

      // Only the current chapter's unit is open; the others show a summary.
      await expect(unitButton(page, "进阶")).toHaveAttribute("aria-expanded", "true");
      await expect(unitButton(page, "报文")).toHaveAttribute("aria-expanded", "false");
      await expect(nav.getByRole("link", { name: /请求：把要什么说清楚/ })).toHaveCount(0);
      await expect(nav.locator('[aria-current="page"]')).toContainText("缓存：快，但别给旧内容");

      // The current chapter's sections are nested under it.
      const outline = nav.getByTestId("lesson-outline");
      await expect(outline.getByRole("link")).toHaveCount(4);
      await expect(outline.locator('[aria-current="location"]')).toHaveText("为什么需要缓存");

      // Scrolling the article moves the highlight.
      await page.locator("#动手两天的缓存回放").scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const target = document.getElementById("动手两天的缓存回放")!;
        window.scrollTo(0, window.scrollY + target.getBoundingClientRect().top - 80);
      });
      await expect(outline.locator('[aria-current="location"]')).toHaveText("动手：两天的缓存回放");

      // A unit opened by hand stays open after reload and on other chapters.
      await unitButton(page, "报文").click();
      await expect(nav.getByRole("link", { name: /请求：把要什么说清楚/ })).toBeVisible();
      await page.reload();
      await expect(unitButton(page, "报文")).toHaveAttribute("aria-expanded", "true");

      // Moving to a chapter in another unit opens that unit; the previous
      // current unit falls back to collapsed, the remembered one stays open.
      await unitButton(page, "实战").click();
      await nav.getByRole("link", { name: /用 Network 面板排错/ }).click();
      await expect(page.locator("main main h1")).toContainText("用 Network 面板排错", { timeout: 20_000 });
      await expect(unitButton(page, "实战")).toHaveAttribute("aria-expanded", "true");
      await expect(unitButton(page, "报文")).toHaveAttribute("aria-expanded", "true");
      await expect(unitButton(page, "进阶")).toHaveAttribute("aria-expanded", "false");

      // The current unit can be collapsed for this view, but never hides the
      // current chapter on the next visit.
      await unitButton(page, "实战").click();
      await expect(unitButton(page, "实战")).toHaveAttribute("aria-expanded", "false");
      await page.reload();
      await expect(unitButton(page, "实战")).toHaveAttribute("aria-expanded", "true");

      // Mobile: the same directory lives in the drawer; jumping to a section closes it.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "打开章节目录" }).click();
      const drawer = page.getByRole("dialog", { name: "课程章节" });
      await expect(drawer).toBeVisible();
      const drawerOutline = drawer.getByTestId("lesson-outline");
      await drawerOutline.getByRole("link").last().click();
      await expect(drawer).toBeHidden();
      await expect(page).toHaveURL(/#/);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
