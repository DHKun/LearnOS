import { expect, test } from "@playwright/test";

import { api, createTestStudent, deleteTestStudent, login } from "./helpers";

test.describe("管理员部署控制台", () => {
  test("扫描、查看部署状态与权限隔离", async ({ browser }) => {
    const student = await createTestStudent("deploy-view");
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();

    try {
      await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");

      const overview = await api<{
        state: { currentVersion: string | null };
        scan: { counts: Record<string, number>; canDeploy: boolean };
      }>(adminPage, "/api/admin/deployments");
      expect(overview.status).toBe(200);
      expect(overview.body?.data?.scan.counts).toBeTruthy();
      expect(typeof overview.body?.data?.scan.canDeploy).toBe("boolean");

      const scan = await api<{ items: unknown[]; counts: Record<string, number> }>(
        adminPage,
        "/api/admin/deployments/scan",
      );
      expect(scan.status).toBe(200);
      expect(Array.isArray(scan.body?.data?.items)).toBe(true);

      await adminPage.goto("/admin/courses");
      await expect(adminPage.getByRole("heading", { name: "课程扫描" })).toBeVisible();
      await adminPage.getByRole("button", { name: "扫描更新" }).click();
      await expect(adminPage.getByRole("button", { name: "扫描更新" })).toBeEnabled({
        timeout: 20_000,
      });

      await adminPage.goto("/admin/deployments");
      await expect(adminPage.getByRole("heading", { name: "部署更新" })).toBeVisible();
      await expect(adminPage.getByText("当前系统版本")).toBeVisible();
      await expect(adminPage.getByText("当前课程版本清单")).toBeVisible();
      await expect(adminPage.getByText("历史更新记录")).toBeVisible();
      await expect(adminPage.getByRole("button", { name: "编译并部署" })).toBeVisible();

      await adminPage.getByRole("button", { name: "扫描更新" }).click();
      await expect(
        adminPage.getByText(/扫描完成|所有本地课程都已是最新/).first(),
      ).toBeVisible({ timeout: 20_000 });

      await login(studentPage, student.email, student.password);
      const forbidden = await api(studentPage, "/api/admin/deployments");
      expect(forbidden.status).toBe(403);
      expect(forbidden.body?.error?.code).toBe("FORBIDDEN");

      await studentPage.goto("/admin/deployments");
      await expect(studentPage).toHaveURL(/\/courses/, { timeout: 20_000 });
    } finally {
      await deleteTestStudent(student.id);
      await studentContext.close();
      await adminContext.close();
    }
  });
});
