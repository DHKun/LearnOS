import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  getPointsTotal,
  login,
} from "./helpers";

async function enrollInHttpCourse(page: Page) {
  const course = await getCourseBySlug("http-from-zero");
  await page.goto(`/courses/${course.slug}`);
  await page.getByRole("button", { name: "参加课程" }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });
  return course;
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

test.describe("常驻浮动笔记", () => {
  test("滚动到章节底部仍可见，桌面端非模态且切换章节不丢笔记", async ({ page }) => {
    const student = await createTestStudent("notes-workspace");
    try {
      await login(page, student.email, student.password);
      await enrollInHttpCourse(page);

      // 页面滚到章节最底部，悬浮按钮仍应固定在视口中。
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const toggle = page.getByTestId("notes-toggle");
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAccessibleName("打开笔记");

      await toggle.click();
      const panel = page.getByTestId("notes-panel");
      await expect(panel).toBeVisible();
      await expect(page.getByRole("textbox", { name: "章节笔记" })).toBeVisible();
      // 非模态：正文仍然可读，页面没有模态遮罩。
      await expect(page.getByRole("heading", { name: "互联网与 HTTP" })).toBeVisible();
      await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
      await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

      const note = "## 我的理解\n\n- 笔记应随章节保存\n- 侧栏不遮挡正文";
      const textarea = page.getByRole("textbox", { name: "章节笔记" });
      await textarea.fill(note);
      await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 20_000 });

      // Escape 收起侧栏。
      await page.keyboard.press("Escape");
      await expect(panel).toBeHidden();

      // 刷新后笔记仍在。
      await page.reload();
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByRole("textbox", { name: "章节笔记" })).toHaveValue(note, {
        timeout: 20_000,
      });
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("notes-panel")).toBeHidden();

      // 切换章节加载对应笔记；切回后原笔记仍在。
      const nav = page.getByRole("navigation", { name: "课程章节" });
      await nav.getByRole("link").filter({ hasText: "浏览器与服务器" }).click();
      await expect(page.getByRole("heading", { name: "浏览器与服务器" })).toBeVisible();
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByRole("textbox", { name: "章节笔记" })).toHaveValue("", {
        timeout: 20_000,
      });
      await page.keyboard.press("Escape");
      await nav.getByRole("link").filter({ hasText: "互联网与 HTTP" }).click();
      await expect(page.getByRole("heading", { name: "互联网与 HTTP" })).toBeVisible();
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByRole("textbox", { name: "章节笔记" })).toHaveValue(note, {
        timeout: 20_000,
      });
    } finally {
      await deleteTestStudent(student.id);
    }
  });

  test("专注模式仍可使用笔记", async ({ page }) => {
    const student = await createTestStudent("notes-focus");
    try {
      await login(page, student.email, student.password);
      await enrollInHttpCourse(page);

      await page.getByRole("button", { name: "专注模式" }).click();
      await expect(page.getByRole("navigation", { name: "课程章节" })).toBeHidden();
      const toggle = page.getByTestId("notes-toggle");
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(page.getByRole("textbox", { name: "章节笔记" })).toBeVisible();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});

test.describe("小屏幕浮动笔记", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("浮动按钮不遮挡下一章操作", async ({ page }) => {
    const student = await createTestStudent("notes-mobile");
    try {
      await login(page, student.email, student.password);
      await enrollInHttpCourse(page);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const toggle = page.getByTestId("notes-toggle");
      await expect(toggle).toBeVisible();

      const next = page.getByRole("link", { name: /下一节/ });
      await next.scrollIntoViewIfNeeded();
      const [toggleBox, nextBox] = await Promise.all([
        toggle.boundingBox(),
        next.boundingBox(),
      ]);
      expect(toggleBox).not.toBeNull();
      expect(nextBox).not.toBeNull();
      expect(overlaps(toggleBox!, nextBox!)).toBe(false);

      // 移动端使用右侧抽屉，关闭后正文恢复。
      await toggle.click();
      const panel = page.getByTestId("notes-panel");
      await expect(panel).toBeVisible();
      await panel.getByRole("button", { name: "关闭笔记", exact: true }).click();
      await expect(panel).toBeHidden();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});

test.describe("章节自动结章与状态同步", () => {
  test("两个必需活动全部通过后自动结章，进度同步且积分只发一次", async ({ page }) => {
    test.setTimeout(180_000);
    const student = await createTestStudent("chapter-auto");
    try {
      await login(page, student.email, student.password);
      const course = await enrollInHttpCourse(page);
      const lessons = await getLessons(course.id);
      const methods = lessons.find((lesson) => lesson.slug === "http-methods")!;
      const enrollment = (await getEnrollments(student.id))[0];

      await page.goto(`/learn/${course.id}?lesson=${methods.id}`);
      await expect(page.getByRole("heading", { name: "HTTP 方法" })).toBeVisible();

      const nav = page.getByRole("navigation", { name: "课程章节" });
      const item = nav.getByRole("link").filter({ hasText: "HTTP 方法" });
      await expect(item).toContainText("第 5 章");
      await expect(item).toHaveAttribute("data-status", "in_progress");
      await expect(page.getByTestId("course-progress-text")).toContainText("0 / 9");

      // 1. 第一个必需实验通过后，章节不能自动完成。
      const methodLab = page.getByTestId("http-method-match");
      await methodLab.getByRole("button", { name: "GET", exact: true }).first().click();
      await methodLab.getByRole("button", { name: "POST", exact: true }).nth(1).click();
      await methodLab.getByRole("button", { name: "PUT", exact: true }).nth(2).click();
      await methodLab.getByRole("button", { name: "DELETE", exact: true }).nth(3).click();
      await methodLab.getByRole("button", { name: "提交方法匹配" }).click();
      await expect(page.getByText("四种场景的语义与方法全部匹配。")).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByTestId("chapter-completed-banner")).toBeHidden();
      await expect(item).toHaveAttribute("data-status", "in_progress");
      await expect(
        page.locator('[data-block-result="methods-lab"]'),
      ).toHaveAttribute("data-passed", "true");
      await expect(
        page.locator('[data-block-result="methods-check"]'),
      ).toHaveAttribute("data-passed", "false");
      expect(await getPointsTotal(student.id)).toBe(0);

      // 2. 第二个必需知识检查通过后立即结章，不强制跳页。
      const methodsCheck = page.locator('[data-block-id="methods-check"]');
      await methodsCheck.getByRole("radio", { name: "POST" }).check();
      await methodsCheck.getByRole("checkbox", { name: "GET" }).check();
      await methodsCheck.getByRole("checkbox", { name: "HEAD" }).check();
      await methodsCheck.getByRole("radio", { name: "正确" }).check();
      await methodsCheck.getByRole("button", { name: "提交知识检查" }).click();
      await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });

      const banner = page.getByTestId("chapter-completed-banner");
      await expect(banner).toBeVisible({ timeout: 5_000 });
      await expect(banner).toContainText("本章已完成");
      await expect(banner.getByRole("link", { name: /进入下一章/ })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`lesson=${methods.id}`));

      // 左侧章节目录与课程总进度同步更新。
      await expect(item).toHaveAttribute("data-status", "completed", { timeout: 20_000 });
      await expect(item).toContainText("已完成");
      await expect(page.getByTestId("course-progress-text")).toContainText("1 / 9", {
        timeout: 20_000,
      });

      await expect.poll(() => getPointsTotal(student.id)).toBe(10);

      // 3. 再次提交同一 Block 不会重复发积分。
      const replay = await page.evaluate(
        async ({ enrollmentId, lessonId, attemptId }) => {
          const response = await fetch("/api/learning/blocks/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              attemptId,
              enrollmentId,
              lessonId,
              blockId: "methods-check",
              submission: {
                answers: {
                  "q-create": "post",
                  "q-safe": ["get", "head"],
                  "q-delete-status": true,
                },
              },
            }),
          });
          return { status: response.status, body: await response.json() };
        },
        {
          enrollmentId: enrollment.id,
          lessonId: methods.id,
          attemptId: randomUUID(),
        },
      );
      expect(replay.status).toBe(200);
      expect(replay.body.data.pointsAwarded).toBe(0);
      expect(await getPointsTotal(student.id)).toBe(10);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
