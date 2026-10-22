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
    const course = await getCourseBySlug("sql-injection-basics");

    try {
      await login(page, student.email, student.password);
      await page.goto(`/courses/${course.slug}`);
      await page.getByRole("button", { name: "参加课程" }).click();
      await expect(page).toHaveURL(new RegExp(`/learn/${course.id}`));
      await page.getByRole("link", { name: /实验：审计一条登录查询/ }).click();
      await expect(page.getByTestId("sql-activity")).toBeVisible();

      const second = await context.newPage();
      await second.goto(page.url());
      await expect(second.getByTestId("sql-activity")).toBeVisible();

      await page
        .getByRole("checkbox", { name: /使用参数化查询/ })
        .check();
      await expect(page.getByText("实验状态已保存")).toBeVisible({ timeout: 20_000 });

      await second
        .getByRole("checkbox", { name: /转义单引号/ })
        .check();
      await expect(second.getByText("状态版本冲突")).toBeVisible({ timeout: 20_000 });

      await second.getByRole("button", { name: "重新加载最新状态" }).click();
      await expect(
        second.getByRole("checkbox", { name: /使用参数化查询/ }),
      ).toBeChecked({ timeout: 20_000 });

      await second.close();
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
