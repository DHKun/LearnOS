import { expect, test } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

test.describe("章节笔记", () => {
  test("自动保存、刷新恢复、Markdown 预览", async ({ page }) => {
    const student = await createTestStudent("notes");
    const course = await getCourseBySlug("http-hands-on");

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`), { timeout: 20_000 });

      const note = "## 我的理解\n\n- HTTP 请求由方法、目标和 Header 组成\n- 响应状态码表达处理结果";
      await page.getByRole("button", { name: "笔记" }).click();
      const textarea = page.getByPlaceholder("输入本章节笔记");
      await textarea.fill(note);
      await expect(page.getByText("已自动保存")).toBeVisible({ timeout: 20_000 });

      await page.reload();
      await page.getByRole("button", { name: "笔记" }).click();
      await expect(page.getByPlaceholder("输入本章节笔记")).toHaveValue(note, { timeout: 20_000 });

      await page.getByRole("button", { name: "预览" }).click();
      await expect(page.getByRole("heading", { name: "我的理解" })).toBeVisible();
      await expect(page.getByText("HTTP 请求由方法、目标和 Header 组成")).toBeVisible();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
