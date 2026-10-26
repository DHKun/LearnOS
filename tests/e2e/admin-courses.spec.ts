import { expect, test } from "@playwright/test";

import {
  api,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  login,
} from "./helpers";

test.describe("管理员课程管理", () => {
  test("归档禁止新报名；恢复发布后可参加；元信息可编辑", async ({ browser }) => {
    const course = await getCourseBySlug("http-hands-on");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const student = await createTestStudent("course-admin");
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();

    try {
      await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");
      await login(studentPage, student.email, student.password);

      // 归档
      const archived = await api(adminPage, `/api/admin/courses/${course.id}`, "PATCH", {
        status: "archived",
      });
      expect(archived.status).toBe(200);

      const blockedJoin = await api(studentPage, "/api/enrollments", "POST", {
        courseId: course.id,
      });
      expect(blockedJoin.status).toBe(409);
      expect(blockedJoin.body?.error?.code).toBe("COURSE_NOT_AVAILABLE");

      // 学生目录不再展示归档课程
      const catalog = await api<{ items: { id: string }[] }>(studentPage, "/api/courses");
      expect(catalog.body?.data?.items.some((item) => item.id === course.id)).toBe(false);

      // 恢复发布
      const published = await api(adminPage, `/api/admin/courses/${course.id}`, "PATCH", {
        status: "published",
      });
      expect(published.status).toBe(200);

      const joined = await api(studentPage, "/api/enrollments", "POST", {
        courseId: course.id,
      });
      expect(joined.status).toBe(200);

      // 编辑标题与简介
      const original = await api<{ course: { title: string; description: string } }>(
        adminPage,
        `/api/admin/courses/${course.id}`,
      );
      const title = `${original.body!.data!.course.title}（临时）`;
      const patched = await api(adminPage, `/api/admin/courses/${course.id}`, "PATCH", {
        title,
        description: "管理员编辑的简介",
      });
      expect(patched.status).toBe(200);

      const updated = await api<{ course: { title: string; description: string } }>(
        adminPage,
        `/api/admin/courses/${course.id}`,
      );
      expect(updated.body?.data?.course.title).toBe(title);
      expect(updated.body?.data?.course.description).toBe("管理员编辑的简介");

      // 管理端页面能看到课程学员
      await adminPage.goto(`/admin/courses/${course.id}`);
      await expect(
        adminPage.getByRole("row", { name: new RegExp(student.name) }),
      ).toBeVisible({ timeout: 20_000 });

      // 恢复原元信息
      await api(adminPage, `/api/admin/courses/${course.id}`, "PATCH", {
        title: original.body!.data!.course.title,
        description: original.body!.data!.course.description,
      });
    } finally {
      await api(adminPage, `/api/admin/courses/${course.id}`, "PATCH", {
        status: "published",
      }).catch(() => undefined);
      await studentContext.close();
      await adminContext.close();
      await deleteTestStudent(student.id);
    }
  });
});
