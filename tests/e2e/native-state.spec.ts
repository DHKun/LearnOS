import { expect, test } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

test.describe("原生互动组件状态", () => {
  test("多标签保存触发版本冲突并可恢复最新状态", async ({ page, context }) => {
    const student = await createTestStudent("native-state");
    const course = await getCourseBySlug("http-hands-on");

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`));
      // 第 3 章所在的「报文」单元默认收起，先展开。
      await page
        .getByRole("navigation", { name: "课程章节" })
        .locator('li[data-unit="报文"] > button')
        .click();
      await page.getByRole("link", { name: /请求：把要什么说清楚/ }).click();
      await expect(page.getByTestId("http-hands-on-request")).toBeVisible();

      // Page 1 saves version 1.
      await page.getByLabel("请求实验 URL").fill("/api/books/2");
      await expect(page.getByText("实验状态已保存")).toBeVisible({ timeout: 20_000 });

      // Page 2 loads the latest version and saves version 2.
      const second = await context.newPage();
      await second.goto(page.url());
      await expect(second.getByTestId("http-hands-on-request")).toBeVisible();
      await second.getByLabel("请求实验 URL").fill("/api/books/1");
      await expect(second.getByText("实验状态已保存")).toBeVisible({ timeout: 20_000 });

      // Page 1 still holds version 1, so its next save conflicts.
      await page.getByLabel("请求实验 URL").fill("/api/books/3");
      await expect(page.getByText("状态版本冲突")).toBeVisible({ timeout: 20_000 });

      await page.getByRole("button", { name: "重新加载最新状态" }).click();
      await expect(page.getByLabel("请求实验 URL")).toHaveValue("/api/books/1", {
        timeout: 20_000,
      });

      await second.close();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
