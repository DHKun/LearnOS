import { expect, test } from "@playwright/test";

import { api, createTestStudent, deleteTestStudent, login, serviceClient } from "./helpers";

test.describe("账号与权限边界", () => {
  test("管理员创建学生；学生无法访问管理端；停用立即生效", async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");
    await expect(adminPage).toHaveURL(/\/admin/);

    const email = `ui-created-${Date.now()}@learnos.local`;
    const password = "Ui-Created-2025!";
    const displayName = `界面创建 ${Date.now()}`;

    await adminPage.goto("/admin/students");
    await adminPage.getByRole("button", { name: "创建学生" }).click();
    const createDialog = adminPage.getByRole("dialog");
    await createDialog.getByLabel("姓名").fill(displayName);
    await createDialog.getByLabel("邮箱").fill(email);
    await createDialog.getByLabel("初始密码（至少 8 位）").fill(password);
    await createDialog.getByRole("button", { name: "创建账号" }).click();
    await expect(createDialog.getByText("学生账号已创建")).toBeVisible({ timeout: 20_000 });
    await createDialog.getByRole("button", { name: "完成" }).click();

    const db = serviceClient();
    const { data: profile, error } = await db
      .from("profiles")
      .select("user_id,role")
      .eq("email", email)
      .single();
    expect(error).toBeNull();
    expect(profile?.role).toBe("student");
    const studentId = profile!.user_id as string;

    try {
      const studentContext = await browser.newContext();
      const studentPage = await studentContext.newPage();
      await login(studentPage, email, password);
      await expect(studentPage).toHaveURL(/\/courses/);

      // 学生访问管理页面被重定向
      await studentPage.goto("/admin");
      await expect(studentPage).toHaveURL(/\/courses/);

      // 学生调用管理员 API 被拒绝
      const forbidden = await api(studentPage, "/api/admin/overview");
      expect(forbidden.status).toBe(403);
      expect(forbidden.body?.error?.code).toBe("FORBIDDEN");

      // 管理员不能调用仅学生可用的业务接口
      const adminAttempt = await api(adminPage, "/api/enrollments", "POST", {
        courseId: "00000000-0000-4000-8000-000000000001",
      });
      expect(adminAttempt.status).toBe(403);

      // 停用后业务接口立即拒绝
      const disabled = await api(adminPage, `/api/admin/students/${studentId}`, "PATCH", {
        disabled: true,
      });
      expect(disabled.status).toBe(200);

      const meAfterDisable = await api(studentPage, "/api/me");
      expect(meAfterDisable.status).toBe(403);
      expect(meAfterDisable.body?.error?.code).toBe("ACCOUNT_DISABLED");

      await studentPage.goto("/me");
      await expect(studentPage).toHaveURL(/\/login\?reason=disabled/);

      // 重新启用后恢复访问
      const enabled = await api(adminPage, `/api/admin/students/${studentId}`, "PATCH", {
        disabled: false,
      });
      expect(enabled.status).toBe(200);

      // 既有会话在账号恢复后重新可用（禁用期间业务接口会逐次校验 disabled_at）
      await studentPage.goto("/courses");
      await expect(studentPage).toHaveURL(/\/courses/);
      await expect(studentPage.getByRole("heading", { name: "课程学习" })).toBeVisible();

      await studentContext.close();
    } finally {
      await deleteTestStudent(studentId);
      await adminContext.close();
    }
  });

  test("无 Origin 或跨源 Origin 的写请求被 CSRF 防护拒绝", async ({ page }) => {
    const student = await createTestStudent("csrf");
    try {
      await login(page, student.email, student.password);
      await page.goto("/courses");

      const noOrigin = await page.request.post("/api/enrollments", {
        data: { courseId: "00000000-0000-4000-8000-000000000001" },
      });
      expect(noOrigin.status()).toBe(403);
      const noOriginBody = await noOrigin.json();
      expect(noOriginBody.error.code).toBe("CSRF_ORIGIN_REJECTED");

      const evilOrigin = await page.request.post("/api/enrollments", {
        data: { courseId: "00000000-0000-4000-8000-000000000001" },
        headers: { Origin: "http://evil.example" },
      });
      expect(evilOrigin.status()).toBe(403);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
