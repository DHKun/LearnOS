import { expect, test } from "@playwright/test";

import {
  api,
  createTestCourse,
  createTestStudent,
  deleteTestCourse,
  deleteTestStudent,
  getCourseBySlug,
  getEnrollments,
  getLessons,
  getPointsTotal,
  login,
  rpc,
} from "./helpers";

test.describe("课程占用：并发、幂等与恢复", () => {
  test("两个标签页同时参加不同课程只保留一条 active；退出再进保留进度与笔记", async ({
    browser,
  }) => {
    const student = await createTestStudent("concurrent");
    const mainCourse = await getCourseBySlug("http-hands-on");
    const courseA = await createTestCourse("concurrent-a");
    const courseB = await createTestCourse("concurrent-b");

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await login(pageA, student.email, student.password);
      await login(pageB, student.email, student.password);

      // 同时提交两个不同课程的报名请求。
      const results = await Promise.all([
        api<{ id: string }>(pageA, "/api/enrollments", "POST", { courseId: courseA.id }),
        api<{ id: string }>(pageB, "/api/enrollments", "POST", { courseId: courseB.id }),
      ]);
      const succeeded = results.filter((result) => result.status === 200);
      const rejected = results.filter((result) => result.status === 409);
      expect(succeeded).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].body?.error?.code).toBe("ACTIVE_COURSE_EXISTS");

      const activeEnrollment = succeeded[0].body!.data!;
      const winnerCourseId =
        results[0].status === 200 ? courseA.id : courseB.id;
      const winnerPage = results[0].status === 200 ? pageA : pageB;

      // 同一课程重复报名幂等。
      const repeat = await api<{ id: string }>(winnerPage, "/api/enrollments", "POST", {
        courseId: winnerCourseId,
      });
      expect(repeat.status).toBe(200);
      expect(repeat.body?.data?.id).toBe(activeEnrollment.id);
      expect(await getEnrollments(student.id)).toHaveLength(1);

      // 退出测试课程，进入正式课程。
      const abandonTest = await api(
        winnerPage,
        `/api/enrollments/${activeEnrollment.id}/abandon`,
        "POST",
        {},
      );
      expect(abandonTest.status).toBe(200);

      const joinMain = await api<{ id: string }>(winnerPage, "/api/enrollments", "POST", {
        courseId: mainCourse.id,
      });
      expect(joinMain.status).toBe(200);
      const mainEnrollment = joinMain.body!.data!;

      // 完成一个手动章节并写笔记。
      const lessons = await getLessons(mainCourse.id);
      const article = lessons.find(
        (lesson) => lesson.completion_policy === "manual" && lesson.required,
      )!;
      const complete = await api(winnerPage, `/api/lessons/${article.id}/complete`, "POST", {
        enrollmentId: mainEnrollment.id,
      });
      expect(complete.status).toBe(200);
      expect(complete.body?.data?.lessonStatus).toBe("completed");

      const noteContent = "退出前写下的私人笔记";
      const note = await api(winnerPage, `/api/notes/${article.id}`, "PUT", {
        content: noteContent,
      });
      expect(note.status).toBe(200);

      // 退出正式课程，加入另一门测试课程；此时再进正式课程应被占用拒绝。
      const abandonMain = await api(
        winnerPage,
        `/api/enrollments/${mainEnrollment.id}/abandon`,
        "POST",
        {},
      );
      expect(abandonMain.status).toBe(200);

      const otherTestCourseId =
        winnerCourseId === courseA.id ? courseB.id : courseA.id;
      const switchCourse = await api<{ id: string }>(
        winnerPage,
        "/api/enrollments",
        "POST",
        { courseId: otherTestCourseId },
      );
      expect(switchCourse.status).toBe(200);

      const blockedMain = await api(winnerPage, "/api/enrollments", "POST", {
        courseId: mainCourse.id,
      });
      expect(blockedMain.status).toBe(409);
      expect(blockedMain.body?.error?.code).toBe("ACTIVE_COURSE_EXISTS");

      // 退出测试课程，恢复正式课程；进度和笔记仍在。
      await api(winnerPage, `/api/enrollments/${switchCourse.body?.data?.id}/abandon`, "POST", {});
      const resume = await api<{ id: string; status: string }>(
        winnerPage,
        "/api/enrollments",
        "POST",
        { courseId: mainCourse.id },
      );
      expect(resume.status).toBe(200);
      expect(resume.body?.data?.id).toBe(mainEnrollment.id);
      expect(resume.body?.data?.status).toBe("active");

      const restoredNote = await api<{ content: string }>(
        winnerPage,
        `/api/notes/${article.id}`,
      );
      expect(restoredNote.body?.data?.content).toBe(noteContent);

      const currentRestored = await api<{
        lessonProgress: Record<string, { status: string }>;
        courseProgress: { completed: number };
      }>(winnerPage, "/api/enrollments/current");
      expect(currentRestored.body?.data?.lessonProgress[article.id]?.status).toBe("completed");
      expect(currentRestored.body?.data?.courseProgress.completed).toBeGreaterThanOrEqual(1);
      expect(await getPointsTotal(student.id)).toBe(10);

      const finalEnrollments = await getEnrollments(student.id);
      expect(finalEnrollments.filter((row) => row.status === "active")).toHaveLength(1);
      expect(finalEnrollments).toHaveLength(3);
    } finally {
      await contextA.close();
      await contextB.close();
      await deleteTestStudent(student.id);
      await deleteTestCourse(courseA.id);
      await deleteTestCourse(courseB.id);
    }
  });

  test("不同学生可以同时各占一门课程", async () => {
    const studentA = await createTestStudent("pair-a");
    const studentB = await createTestStudent("pair-b");
    const courseA = await createTestCourse("pair-a");
    const courseB = await createTestCourse("pair-b");

    try {
      const joinA = await rpc("join_course", {
        p_student: studentA.id,
        p_course: courseA.id,
      });
      const joinB = await rpc("join_course", {
        p_student: studentB.id,
        p_course: courseB.id,
      });
      expect(joinA).toBeTruthy();
      expect(joinB).toBeTruthy();
    } finally {
      await deleteTestStudent(studentA.id);
      await deleteTestStudent(studentB.id);
      await deleteTestCourse(courseA.id);
      await deleteTestCourse(courseB.id);
    }
  });
});
