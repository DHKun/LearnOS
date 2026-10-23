import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getEnrollments,
  getLessons,
  getPointsTotal,
  login,
  serviceClient,
} from "./helpers";

async function openChapter(page: Page, title: string) {
  const href = await page.evaluate((chapterTitle) => {
    const links = Array.from(document.querySelectorAll("a"));
    const link = links.find((item) => item.textContent?.includes(chapterTitle));
    return link?.getAttribute("href") ?? null;
  }, title);
  if (!href) throw new Error(`chapter link not found: ${title}`);
  await page.goto(href);
}

test.describe("HTTP 混合章节完整学习闭环", () => {
  test("纯文字、动画、实验、知识检查、all/any 与最终测验", async ({ page }) => {
    test.setTimeout(180_000);
    const student = await createTestStudent("http-mixed");
    const db = serviceClient();

    try {
      await login(page, student.email, student.password);
      await page.goto("/courses/http-from-zero");
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(/\/learn\//);

      const courseId = page.url().split("/learn/")[1].split("?")[0];
      const lessons = await getLessons(courseId);
      const bySlug = new Map(lessons.map((lesson) => [lesson.slug, lesson]));
      const initialEnrollments = await getEnrollments(student.id);
      const enrollmentId = initialEnrollments[0].id;

      // 伪造 passed 字段不能进入 Block 提交契约。
      const forged = await page.evaluate(
        async ({ enrollmentId, lessonId, attemptId }) => {
          const response = await fetch("/api/learning/blocks/submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              attemptId,
              enrollmentId,
              lessonId,
              blockId: "request-lab",
              submission: { method: "GET", path: "/users/1" },
              passed: true,
            }),
          });
          return { status: response.status, body: await response.json() };
        },
        {
          enrollmentId,
          lessonId: bySlug.get("request-response")!.id,
          attemptId: randomUUID(),
        },
      );
      expect(forged.status).toBe(422);

      const directComplete = await page.evaluate(
        async ({ enrollmentId, lessonId }) => {
          const response = await fetch(`/api/lessons/${lessonId}/complete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enrollmentId }),
          });
          return { status: response.status, body: await response.json() };
        },
        { enrollmentId, lessonId: bySlug.get("request-response")!.id },
      );
      expect(directComplete.status).toBe(400);
      expect(directComplete.body?.error?.code).toBe("COMPLETION_NOT_ALLOWED");

      // 1. 纯文字章节：没有动画、实验和题目也能手动完成。
      await expect(page.getByRole("heading", { name: "互联网与 HTTP" })).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByText(/本章已完成/).first()).toBeVisible();

      // 2. 只有动画的章节。
      await openChapter(page, "浏览器与服务器");
      await expect(page.getByRole("heading", { name: "一次 HTTP 请求的旅程" })).toBeVisible();
      await page.getByRole("button", { name: "下一步" }).first().click();
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByText(/本章已完成/).first()).toBeVisible();

      // 3. 自测题只做即时反馈，不自动完成正式章节。
      await openChapter(page, "URL 的组成");
      await page.getByRole("radio").first().check();
      await page.getByRole("button", { name: "检查答案" }).click();
      await expect(page.getByText(/判断正确|再想一步/)).toBeVisible();
      await expect(page.getByRole("button", { name: /标记本章完成/ })).toBeVisible();
      await page.getByRole("button", { name: /标记本章完成/ }).click();

      // 4. 浏览器 JS 模拟实验；刷新后参数恢复，提交后章节自动完成。
      await openChapter(page, "请求与响应");
      const pathInput = page.getByLabel("路径");
      await pathInput.fill("/users/2");
      await page.waitForTimeout(900);
      await page.reload();
      await expect(page.getByLabel("路径")).toHaveValue("/users/2");
      await page.getByLabel("路径").fill("/users/1");
      await page.getByRole("button", { name: "提交实验结论" }).click();
      await expect(page.getByText("服务端验证通过")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });

      // 5. all 模式：先完成实验，再完成知识检查，两者都通过才结章。
      await page.getByRole("link", { name: /下一节：HTTP 方法/ }).click();
      await expect(page.getByRole("heading", { name: "HTTP 方法" })).toBeVisible();
      const methodLab = page.getByTestId("http-method-match");
      await methodLab.getByRole("button", { name: "GET", exact: true }).first().click();
      await methodLab.getByRole("button", { name: "POST", exact: true }).nth(1).click();
      await methodLab.getByRole("button", { name: "PUT", exact: true }).nth(2).click();
      await methodLab.getByRole("button", { name: "DELETE", exact: true }).nth(3).click();
      await methodLab.getByRole("button", { name: "提交方法匹配" }).click();
      await expect(page.getByText("四种场景的语义与方法全部匹配。")).toBeVisible();

      const methodsCheck = page.locator('[data-block-id="methods-check"]');
      await methodsCheck.getByRole("radio", { name: "POST" }).check();
      await methodsCheck.getByRole("checkbox", { name: "GET" }).check();
      await methodsCheck.getByRole("checkbox", { name: "HEAD" }).check();
      await methodsCheck.getByRole("radio", { name: "正确" }).check();
      await methodsCheck.getByRole("button", { name: "提交知识检查" }).click();
      await expect(page.getByText("本章知识检查已通过")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(/本章已完成/).first()).toBeVisible();

      // 6. 只有知识检查的章节。
      await openChapter(page, "状态码");
      const statusCheck = page.locator('[data-block-id="status-check"]');
      await statusCheck.getByRole("radio", { name: "404" }).check();
      await statusCheck.getByRole("radio", { name: "201" }).check();
      await statusCheck.getByRole("radio", { name: "错误" }).check();
      await statusCheck.getByRole("button", { name: "提交知识检查" }).click();
      await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });

      // 7. 多个动画状态隔离；模拟参数刷新后恢复；any 模式一个 Block 通过即可。
      await openChapter(page, "Header 与 Cookie");
      const concepts = page.locator('[data-concept-id="http-from-zero/headers-cookies"]');
      await expect(concepts).toHaveCount(2);
      await concepts.first().getByRole("button", { name: "下一步" }).click();
      await concepts.first().getByRole("button", { name: "下一步" }).click();
      const lessonId = bySlug.get("headers-cookies")!.id;
      await page.waitForTimeout(900);
      const stateResponse = await page.evaluate(async (id) => {
        const response = await fetch(`/api/learning/states/${id}`);
        return response.json();
      }, lessonId);
      expect(stateResponse.data.state.schemaVersion).toBe(2);
      expect(stateResponse.data.state.blocks["hc-set-cookie"].conceptStep).toBe(2);
      expect(stateResponse.data.state.blocks["hc-request-cookie"].conceptStep).toBe(0);

      await page.getByRole("checkbox", { name: "登录响应返回 Set-Cookie" }).check();
      await page.getByRole("checkbox", { name: "HttpOnly" }).check();
      await page.waitForTimeout(900);
      await page.reload();
      await expect(page.getByRole("checkbox", { name: "登录响应返回 Set-Cookie" })).toBeChecked();
      await expect(page.getByRole("checkbox", { name: "HttpOnly" })).toBeChecked();
      await page.getByRole("button", { name: "提交 Cookie 配置" }).click();
      await expect(page.getByText(/本章已完成/).first()).toBeVisible({ timeout: 20_000 });
      await expect(
        page.locator('[data-block-result="headers-check"]'),
      ).toHaveAttribute("data-passed", "false");

      // 8. 完全无互动组件的总结章节。
      await openChapter(page, "总结");
      await page.getByRole("button", { name: /标记本章完成/ }).click();
      await expect(page.getByText(/本章已完成/).first()).toBeVisible();

      // 9. 最终测验保持服务端判分，含单选、多选、判断题。
      await openChapter(page, "最终测验");
      const fRequest = page.locator('[data-question-id="f-request"]');
      await fRequest.locator('input[value="line"]').check();
      await fRequest.locator('input[value="headers"]').check();
      await fRequest.locator('input[value="body"]').check();
      await page.locator('[data-question-id="f-get"] input[value="true"]').check();
      await page.locator('[data-question-id="f-post"] input[value="post"]').check();
      await page.locator('[data-question-id="f-404"] input[value="404"]').check();
      await page.locator('[data-question-id="f-cookie"] input[value="no-js"]').check();
      await page.getByRole("button", { name: "提交测验" }).click();
      await expect(page.getByText(/测验通过/)).toBeVisible({ timeout: 20_000 });

      // 数据库中的真实记录与积分。
      const enrollments = await getEnrollments(student.id);
      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].status).toBe("completed");
      const { data: progress } = await db
        .from("lesson_progress")
        .select("lesson_id,status")
        .eq("enrollment_id", enrollments[0].id);
      expect(progress?.filter((item) => item.status === "completed")).toHaveLength(
        lessons.length,
      );
      expect(await getPointsTotal(student.id)).toBe(140);
      const points = await page.evaluate(async () => {
        const response = await fetch("/api/me/points");
        return response.json();
      });
      expect(points.data.total).toBe(140);

      // 最终地址仍是课程完成后的复习入口。
      await expect(page.getByText(/测验通过/)).toBeVisible();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
