import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getLessons,
  login,
} from "./helpers";

type Box = {
  x: number;
  width: number;
  right: number;
  display: string;
};

type Layout = {
  viewport: number;
  clientWidth: number;
  scrollWidth: number;
  outer: Box | null;
  content: Box | null;
  nav: Box | null;
  outline: Box | null;
  notes: Box | null;
};

async function setViewport(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForFunction((w) => window.innerWidth === w, width);
  await page.waitForTimeout(200);
}

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        width: Math.round(rect.width),
        right: Math.round(rect.right),
        display: getComputedStyle(element).display,
      };
    };
    return {
      viewport: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      outer: box("body main"),
      content: box("main main"),
      nav: box('aside[aria-label="课程目录"]'),
      outline: box('aside[aria-label="课程目录"] [data-testid="lesson-outline"]'),
      notes: box('[data-testid="notes-panel"]'),
    };
  });
}

function hidden(box: Box | null | undefined): boolean {
  return !box || box.display === "none";
}

function expectNoPageOverflow(measured: Layout, label: string): void {
  expect(
    measured.scrollWidth,
    `${label}: documentElement.scrollWidth ${measured.scrollWidth} > clientWidth ${measured.clientWidth}`,
  ).toBeLessThanOrEqual(measured.clientWidth + 1);
}

async function openLesson(page: Page, courseId: string, lessonId: string, title: string) {
  await page.goto(`/learn/${courseId}?lesson=${lessonId}`);
  await expect(page.locator("main main h1")).toContainText(title);
  await page.waitForTimeout(150);
}

async function closeNotes(page: Page): Promise<void> {
  await page
    .getByTestId("notes-panel")
    .getByRole("button", { name: "关闭笔记", exact: true })
    .click();
  await expect(page.getByTestId("notes-panel")).toBeHidden();
}

test.describe("学习页响应式宽度", () => {
  test("390–1920px 宽度分配、目录内嵌本章大纲与抽屉", async ({ page }) => {
    test.setTimeout(180_000);
    const student = await createTestStudent("responsive");
    const course = await getCourseBySlug("http-hands-on");
    const lessons = await getLessons(course.id);
    const conceptLesson = lessons.find((lesson) => lesson.slug === "request");
    const methodsLesson = lessons.find((lesson) => lesson.slug === "methods");

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });
      await expect(page.locator("main main h1")).toBeVisible();

      const widths = [390, 768, 1024, 1280, 1440, 1536, 1920];
      const measured = new Map<number, Layout>();

      for (const width of widths) {
        await setViewport(page, width);
        const current = await layout(page);
        measured.set(width, current);
        expectNoPageOverflow(current, `${width}px`);
      }

      const mobile = measured.get(390)!;
      const tablet = measured.get(768)!;
      const desktop = measured.get(1024)!;
      const wide = measured.get(1280)!;
      const laptop = measured.get(1440)!;
      const threeCol = measured.get(1536)!;
      const fullHd = measured.get(1920)!;

      // <1024px: one column, directory only through the drawer.
      expect(mobile.nav?.display).toBe("none");
      expect(tablet.nav?.display).toBe("none");
      expect(mobile.content!.width).toBeGreaterThan(330);
      expect(tablet.content!.width).toBeGreaterThan(680);

      // ≥1024px: two columns. The chapter outline lives inside the directory,
      // nested under the current chapter; there is no right rail.
      for (const measuredAt of [desktop, wide, laptop, threeCol, fullHd]) {
        expect(measuredAt.nav?.display).not.toBe("none");
        expect(measuredAt.nav!.width).toBeGreaterThanOrEqual(262);
        expect(measuredAt.nav!.width).toBeLessThanOrEqual(282);
        expect(hidden(measuredAt.outline)).toBe(false);
      }
      expect(desktop.content!.width).toBeGreaterThan(650);
      expect(laptop.content!.width).toBeGreaterThan(1050);

      // Article grows with the window while the page stays two-column.
      expect(wide.content!.width).toBeGreaterThan(desktop.content!.width + 100);
      expect(laptop.content!.width).toBeGreaterThan(wide.content!.width + 100);

      expect(threeCol.content!.width).toBeGreaterThan(1150);
      expect(fullHd.content!.width).toBeGreaterThan(1200);
      expect(fullHd.content!.width).toBeGreaterThan(threeCol.content!.width + 20);

      // Learning page has its own 1600px canvas; other pages keep max-w-7xl.
      expect(fullHd.outer!.width).toBeGreaterThanOrEqual(1590);
      expect(fullHd.outer!.width).toBeLessThanOrEqual(1601);

      // Focus mode: hidden columns must not reserve space.
      await setViewport(page, 1440);
      const beforeFocus = await layout(page);
      await page.getByRole("button", { name: "专注模式" }).click();
      await expect(page.getByRole("button", { name: "退出专注" })).toBeVisible();
      await page.waitForTimeout(200);
      const focus = await layout(page);
      expect(hidden(focus.nav)).toBe(true);
      expect(hidden(focus.outline)).toBe(true);
      expect(focus.content!.width).toBeGreaterThan(beforeFocus.content!.width + 150);
      expectNoPageOverflow(focus, "focus mode");
      await page.getByRole("button", { name: "退出专注" }).click();
      await expect(page.getByRole("button", { name: "专注模式" })).toBeVisible();

      // Notes at 1024px: the left directory (and its outline) yields.
      await setViewport(page, 1024);
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByTestId("notes-panel")).toBeVisible();
      await page.waitForTimeout(200);
      const notes1024 = await layout(page);
      expect(notes1024.notes!.width).toBeGreaterThan(330);
      expect(hidden(notes1024.nav)).toBe(true);
      expect(notes1024.content!.width).toBeGreaterThan(520);
      expectNoPageOverflow(notes1024, "notes 1024");
      await closeNotes(page);

      // Notes at 1440px: the directory and its outline keep their place.
      await setViewport(page, 1440);
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByTestId("notes-panel")).toBeVisible();
      await page.waitForTimeout(200);
      const notes1440 = await layout(page);
      expect(hidden(notes1440.nav)).toBe(false);
      expect(hidden(notes1440.outline)).toBe(false);
      expect(notes1440.content!.width).toBeGreaterThan(650);
      expectNoPageOverflow(notes1440, "notes 1440");
      await closeNotes(page);

      // Notes at 1920px: article still has a healthy width.
      await setViewport(page, 1920);
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByTestId("notes-panel")).toBeVisible();
      await page.waitForTimeout(200);
      const notes1920 = await layout(page);
      expect(hidden(notes1920.nav)).toBe(false);
      expect(notes1920.content!.width).toBeGreaterThan(850);
      expectNoPageOverflow(notes1920, "notes 1920");
      await closeNotes(page);

      // Mobile drawers remain functional.
      await setViewport(page, 390);
      await page.getByRole("button", { name: "打开章节目录" }).click();
      await expect(page.getByRole("dialog", { name: "课程章节" })).toBeVisible();
      await page.getByRole("button", { name: "关闭目录" }).click();
      await expect(page.getByRole("dialog", { name: "课程章节" })).toBeHidden();
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByTestId("notes-panel")).toBeVisible();
      await closeNotes(page);

      // Complex blocks: concept, simulation, code and tables stay inside the article.
      expect(conceptLesson).toBeTruthy();
      expect(methodsLesson).toBeTruthy();

      for (const width of [1024, 1920]) {
        await setViewport(page, width);
        await openLesson(page, course.id, conceptLesson!.id, "请求：把要什么说清楚");
        await expect(page.locator("[data-block-kind='simulation']")).toBeVisible();
        await expect(page.locator("[data-concept-id]").first()).toBeVisible();
        const conceptOverflow = await page.evaluate(() => {
          const root = document.documentElement;
          const content = document.querySelector("main main")!;
          const contentRight = content.getBoundingClientRect().right;
          const offenders = Array.from(
            content.querySelectorAll("section[data-concept-id], section[data-block-kind]"),
          )
            .filter((element) => element.getBoundingClientRect().right > contentRight + 1)
            .map((element) => element.getAttribute("data-concept-id") ?? element.tagName);
          return {
            page: root.scrollWidth > root.clientWidth + 1,
            offenders,
          };
        });
        expect(conceptOverflow.page, `concept page overflow at ${width}`).toBe(false);
        expect(conceptOverflow.offenders, `concept blocks at ${width}`).toEqual([]);

        await openLesson(page, course.id, methodsLesson!.id, "方法：读、建、改、删与重试");
        await expect(page.locator("[data-block-kind='simulation']")).toBeVisible();
        const tableCheck = await page.evaluate(() => {
          const root = document.documentElement;
          const table = document.querySelector("main main table");
          if (!table) return { page: root.scrollWidth > root.clientWidth + 1, wrapped: false };
          let parent = table.parentElement;
          let wrapped = false;
          while (parent) {
            const overflowX = getComputedStyle(parent).overflowX;
            if (overflowX === "auto" || overflowX === "scroll") {
              wrapped = true;
              break;
            }
            parent = parent.parentElement;
          }
          return { page: root.scrollWidth > root.clientWidth + 1, wrapped };
        });
        expect(tableCheck.page, `methods page overflow at ${width}`).toBe(false);
        expect(tableCheck.wrapped, `table wrapper at ${width}`).toBe(true);
      }

      // Other pages keep the original 1280px container.
      await setViewport(page, 1920);
      await page.goto("/courses");
      await expect(page.locator("main h1")).toBeVisible();
      const courses = await page.evaluate(() => {
        const main = document.querySelector("body main")!;
        return Math.round(main.getBoundingClientRect().width);
      });
      expect(courses).toBeLessThanOrEqual(1281);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
