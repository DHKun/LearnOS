import { expect, test } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

test.describe("确认操作使用模态对话框", () => {
  test("退出课程先弹窗确认，可取消或确认", async ({ page }) => {
    const student = await createTestStudent("confirm-dialog");
    const course = await getCourseBySlug("sql-injection-basics");

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`));

      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "退出课程" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText("退出当前课程？")).toBeVisible();
      await expect(dialog.getByText("章节进度、实验状态与笔记会保留")).toBeVisible();

      await dialog.getByRole("button", { name: "取消" }).click();
      await expect(dialog).toBeHidden();

      await page.getByRole("button", { name: "退出课程" }).click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "退出课程" })
        .click();
      await expect(page).toHaveURL(/\/courses$/);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
