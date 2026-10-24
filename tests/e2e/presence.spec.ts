import { expect, test } from "@playwright/test";

import {
  api,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  login,
  query,
} from "./helpers";

test.describe("在线状态与课程占用相互独立", () => {
  test("心跳超过 120 秒后显示离线，但课程仍为 active 且可继续访问", async ({
    page,
    browser,
  }) => {
    const student = await createTestStudent("presence");
    const course = await getCourseBySlug("http-fundamentals");
    const lessons = await getLessons(course.id);
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();

    try {
      await login(page, student.email, student.password);
      const join = await api<{ id: string }>(page, "/api/enrollments", "POST", {
        courseId: course.id,
      });
      expect(join.status).toBe(200);
      const enrollmentId = join.body!.data!.id;

      const heartbeat = await api<{
        lastSeenAt: string;
        lastInteractionAt: string | null;
      }>(page, "/api/learning/heartbeat", "POST", {
        enrollmentId,
        lessonId: lessons[0].id,
        visible: true,
        focused: true,
      });
      expect(heartbeat.status).toBe(200);
      expect(heartbeat.body?.data?.lastSeenAt).toBeTruthy();
      const interactionAt = heartbeat.body?.data?.lastInteractionAt;

      await login(adminPage, "admin@learnos.local", "LearnOS-Admin-2025!");
      const onlineBefore = await api<{ items: { id: string; online: boolean }[] }>(
        adminPage,
        `/api/admin/students?q=${encodeURIComponent(student.name)}&online=true`,
      );
      expect(onlineBefore.body?.data?.items).toHaveLength(1);

      // Simulate 3 minutes passing without touching the enrollment status.
      const threeMinutesAgo = new Date(Date.now() - 180_000).toISOString();
      await query("update public.enrollments set last_seen_at=$1 where id=$2", [
        threeMinutesAgo,
        enrollmentId,
      ]);

      const onlineAfter = await api<{ items: unknown[] }>(
        adminPage,
        `/api/admin/students?q=${encodeURIComponent(student.name)}&online=true`,
      );
      expect(onlineAfter.body?.data?.items).toHaveLength(0);

      const offlineAfter = await api<{ items: { online: boolean; lastSeenAt: string }[] }>(
        adminPage,
        `/api/admin/students?q=${encodeURIComponent(student.name)}&online=false`,
      );
      expect(offlineAfter.body?.data?.items).toHaveLength(1);
      expect(offlineAfter.body?.data?.items[0].online).toBe(false);

      const enrollments = await getEnrollments(student.id);
      expect(enrollments[0].status).toBe("active");
      expect(
        Math.abs(
          new Date(enrollments[0].last_interaction_at!).getTime() -
            new Date(interactionAt!).getTime(),
        ),
      ).toBeLessThan(2_000);

      // Student can still use the course.
      const current = await api<{ enrollment: { status: string } }>(
        page,
        "/api/enrollments/current",
      );
      expect(current.status).toBe(200);
      expect(current.body?.data?.enrollment.status).toBe("active");
    } finally {
      await adminContext.close();
      await deleteTestStudent(student.id);
    }
  });
});
