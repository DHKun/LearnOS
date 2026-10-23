import { expect, test } from "@playwright/test";

import {
  api,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

test.describe("管理员学生详情", () => {
  test("列表进入独立详情，查看标签页并跳转课程", async ({ browser }) => {
    const student = await createTestStudent("admin-detail");
    const course = await getCourseBySlug("http-fundamentals");
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      await login(studentPage, student.email, student.password);
      const joined = await api(studentPage, "/api/enrollments", "POST", {
        courseId: course.id,
      });
      expect(joined.status).toBe(200);

      await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");
      await adminPage.goto("/admin/students");
      await adminPage.getByText(student.name).first().click();
      await expect(adminPage).toHaveURL(new RegExp(`/admin/students/${student.id}`));
      await expect(adminPage.getByRole("heading", { name: student.name })).toBeVisible();

      await adminPage.getByRole("tab", { name: "章节进度" }).click();
      await expect(adminPage.getByText("互联网中的浏览器与服务器")).toBeVisible();

      await adminPage.getByRole("tab", { name: "学习时间线" }).click();
      await expect(adminPage.getByRole("heading", { name: "学习时间线" })).toBeVisible();

      await adminPage.getByRole("tab", { name: "成绩与积分" }).click();
      await expect(adminPage.getByText("课程完成情况")).toBeVisible();

      await adminPage.getByRole("button", { name: "停用账号" }).click();
      const dialog = adminPage.getByRole("dialog");
      await expect(dialog.getByText("停用该学生账号？")).toBeVisible();
      await dialog.getByRole("button", { name: "取消" }).click();

      await adminPage.goto(`/admin/courses/${course.id}`);
      await adminPage.getByRole("link", { name: student.name }).click();
      await expect(adminPage).toHaveURL(new RegExp(`/admin/students/${student.id}`));
    } finally {
      await deleteTestStudent(student.id);
      await studentContext.close();
      await adminContext.close();
    }
  });
});
