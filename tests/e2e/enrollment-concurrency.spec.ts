import { expect, test } from "@playwright/test";

import {
  api,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  getPointsTotal,
  login,
  serviceClient,
} from "./helpers";

test.describe("课程占用：并发、幂等与恢复", () => {
  test("两个标签页同时参加不同课程只保留一条 active；退出再进保留进度与笔记", async ({
    browser,
  }) => {
    const student = await createTestStudent("concurrent");
    const sqlCourse = await getCourseBySlug("sql-injection-basics");
    const retryCourse = await getCourseBySlug("idempotent-retries");

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await login(pageA, student.email, student.password);
      await login(pageB, student.email, student.password);

      await pageA.goto("/courses/sql-injection-basics");
      await pageB.goto("/courses/idempotent-retries");

      // 同时提交两个不同课程的报名请求
      await Promise.allSettled([
        pageA.getByRole("button", { name: "参加课程" }).click(),
        pageB.getByRole("button", { name: "参加课程" }).click(),
      ]);
      await pageA.waitForTimeout(2500);

      const enrollments = await getEnrollments(student.id);
      const active = enrollments.filter((row) => row.status === "active");
      expect(active).toHaveLength(1);
      expect(enrollments).toHaveLength(1);

      const winner = active[0].course_id === sqlCourse.id ? pageA : pageB;
      const loser = winner === pageA ? pageB : pageA;
      await expect(loser.getByText("请先完成或退出当前课程")).toBeVisible({ timeout: 20_000 });

      // 同一课程重复报名幂等：返回同一条 enrollment
      const repeat = await api<{ id: string }>(winner, "/api/enrollments", "POST", {
        courseId: active[0].course_id,
      });
      expect(repeat.status).toBe(200);
      expect(repeat.body?.data?.id).toBe(active[0].id);
      expect(await getEnrollments(student.id)).toHaveLength(1);

      // 完成一个章节并写笔记，然后退出再恢复
      const lessons = await getLessons(active[0].course_id);
      const article = lessons.find((lesson) => lesson.type === "article")!;

      const complete = await api(winner, `/api/lessons/${article.id}/complete`, "POST", {
        enrollmentId: active[0].id,
      });
      expect(complete.status).toBe(200);
      expect(complete.body?.data?.lessonStatus).toBe("completed");

      const noteContent = "退出前写下的私人笔记";
      const note = await api(winner, `/api/notes/${article.id}`, "PUT", {
        content: noteContent,
      });
      expect(note.status).toBe(200);

      const abandon = await api(winner, `/api/enrollments/${active[0].id}/abandon`, "POST", {});
      expect(abandon.status).toBe(200);
      expect(abandon.body?.data?.status).toBe("abandoned");

      const currentAfterAbandon = await api(winner, "/api/enrollments/current");
      expect(currentAfterAbandon.status).toBe(200);
      expect(currentAfterAbandon.body?.data).toBeNull();

      // 报名另一门课程应成功（退出已释放占用）
      const otherCourseId =
        active[0].course_id === sqlCourse.id ? retryCourse.id : sqlCourse.id;
      const switchCourse = await api(winner, "/api/enrollments", "POST", {
        courseId: otherCourseId,
      });
      expect(switchCourse.status).toBe(200);

      // 再切回原课程时复用原 enrollment，并恢复进度与笔记
      const resume = await api<{ id: string; status: string }>(
        winner,
        "/api/enrollments",
        "POST",
        { courseId: active[0].course_id },
      );
      expect(resume.status).toBe(409);
      expect(resume.body?.error?.code).toBe("ACTIVE_COURSE_EXISTS");

      await api(winner, `/api/enrollments/${switchCourse.body?.data?.id}/abandon`, "POST", {});
      const resumeAgain = await api<{ id: string; status: string }>(
        winner,
        "/api/enrollments",
        "POST",
        { courseId: active[0].course_id },
      );
      expect(resumeAgain.status).toBe(200);
      expect(resumeAgain.body?.data?.id).toBe(active[0].id);
      expect(resumeAgain.body?.data?.status).toBe("active");

      const restoredNote = await api<{ content: string }>(
        winner,
        `/api/notes/${article.id}`,
      );
      expect(restoredNote.body?.data?.content).toBe(noteContent);

      const currentRestored = await api<{
        lessonProgress: Record<string, { status: string }>;
        courseProgress: { completed: number };
      }>(winner, "/api/enrollments/current");
      expect(currentRestored.body?.data?.lessonProgress[article.id]?.status).toBe("completed");
      expect(currentRestored.body?.data?.courseProgress.completed).toBeGreaterThanOrEqual(1);
      expect(await getPointsTotal(student.id)).toBe(10);

      // 数据库层面仍只有一条 active；历史课程记录保留为 abandoned
      const finalEnrollments = await getEnrollments(student.id);
      expect(finalEnrollments.filter((row) => row.status === "active")).toHaveLength(1);
      expect(finalEnrollments).toHaveLength(2);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestStudent(student.id);
    }
  });

  test("不同学生可以同时各占一门课程", async () => {
    const studentA = await createTestStudent("pair-a");
    const studentB = await createTestStudent("pair-b");
    const sqlCourse = await getCourseBySlug("sql-injection-basics");
    const retryCourse = await getCourseBySlug("idempotent-retries");

    try {
      const db = serviceClient();
      const joinA = await db.rpc("join_course", {
        p_student: studentA.id,
        p_course: sqlCourse.id,
      });
      const joinB = await db.rpc("join_course", {
        p_student: studentB.id,
        p_course: retryCourse.id,
      });
      expect(joinA.error).toBeNull();
      expect(joinB.error).toBeNull();
    } finally {
      await deleteTestStudent(studentA.id);
      await deleteTestStudent(studentB.id);
    }
  });
});
