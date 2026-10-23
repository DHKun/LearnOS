import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  api,
  createTestStudent,
  deleteTestStudent,
  getCourseBySlug,
  getLessons,
  getPointsTotal,
  login,
  serviceClient,
} from "./helpers";

const QUIZ_FILE = path.join(
  process.cwd(),
  "content/courses/sql-injection-basics/quiz.server.json",
);

type QuizFile = { questions: { id: string; answer: string | string[] }[] };

test.describe("服务端权威与越权防护", () => {
  test("伪造完成、重放、版本冲突、跨用户访问与答案保密", async ({ page, browser }) => {
    const studentA = await createTestStudent("secure-a");
    const studentB = await createTestStudent("secure-b");
    const course = await getCourseBySlug("sql-injection-basics");
    const lessons = await getLessons(course.id);
    const article = lessons.find((lesson) => lesson.slug === "where-injection-comes-from")!;
    const lab = lessons.find((lesson) => lesson.slug === "query-audit-lab")!;
    const quizLesson = lessons.find((lesson) => lesson.slug === "final-quiz")!;

    try {
      await login(page, studentA.email, studentA.password);

      const join = await api<{ id: string }>(page, "/api/enrollments", "POST", {
        courseId: course.id,
      });
      expect(join.status).toBe(200);
      const enrollmentId = join.body!.data!.id;

      // 1. 伪造 server_validated 完成
      const forged = await api(page, `/api/lessons/${lab.id}/complete`, "POST", {
        enrollmentId,
      });
      expect(forged.status).toBe(400);
      expect(forged.body?.error?.code).toBe("COMPLETION_NOT_ALLOWED");
      expect(await getPointsTotal(studentA.id)).toBe(0);

      // 2. 不安全的实验结论不能通过
      const wrong = await api<{ passed: boolean; pointsAwarded: number }>(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId: crypto.randomUUID(),
          enrollmentId,
          lessonId: lab.id,
          blockId: "query-audit-lab",
          submission: { defences: ["escape-quotes"] },
        },
      );
      expect(wrong.status).toBe(200);
      expect(wrong.body?.data?.passed).toBe(false);
      expect(await getPointsTotal(studentA.id)).toBe(0);

      // 3. 正确的实验结论通过并只发一次积分；重放同一 attemptId 幂等
      const attemptId = crypto.randomUUID();
      const submission = { defences: ["parameterize"] };
      const correct = await api<{ passed: boolean; pointsAwarded: number }>(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId,
          enrollmentId,
          lessonId: lab.id,
          blockId: "query-audit-lab",
          submission,
        },
      );
      expect(correct.status).toBe(200);
      expect(correct.body?.data?.passed).toBe(true);
      expect(correct.body?.data?.pointsAwarded).toBe(10);

      const replay = await api<{ duplicate: boolean; passed: boolean }>(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId,
          enrollmentId,
          lessonId: lab.id,
          blockId: "query-audit-lab",
          submission,
        },
      );
      expect(replay.status).toBe(200);
      expect(replay.body?.data?.duplicate).toBe(true);
      expect(replay.body?.data?.passed).toBe(true);
      expect(await getPointsTotal(studentA.id)).toBe(10);

      const reusedSubmission = await api(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId,
          enrollmentId,
          lessonId: lab.id,
          blockId: "query-audit-lab",
          submission: { defences: ["type-cast"] },
        },
      );
      expect(reusedSubmission.status).toBe(409);
      expect(reusedSubmission.body?.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");

      // 4. 多标签状态保存版本冲突
      const state1 = await api<{ version: number }>(
        page,
        `/api/learning/states/${lab.id}`,
        "PUT",
        { enrollmentId, state: { step: 1 }, expectedVersion: 0 },
      );
      expect(state1.status).toBe(200);
      expect(state1.body?.data?.version).toBe(1);

      const state2 = await api(page, `/api/learning/states/${lab.id}`, "PUT", {
        enrollmentId,
        state: { step: 2 },
        expectedVersion: 0,
      });
      expect(state2.status).toBe(409);
      expect(state2.body?.error?.code).toBe("STATE_VERSION_CONFLICT");

      // 4b. 超限载荷被拒绝：事件 8KB、状态 64KB、笔记 64KB
      const oversizedEvent = await api(page, "/api/learning/events", "POST", {
        id: crypto.randomUUID(),
        enrollmentId,
        lessonId: article.id,
        type: "step_interacted",
        payload: { blob: "x".repeat(9 * 1024) },
      });
      expect(oversizedEvent.status).toBe(422);

      const oversizedState = await api(page, `/api/learning/states/${lab.id}`, "PUT", {
        enrollmentId,
        state: { blob: "x".repeat(70 * 1024) },
        expectedVersion: 0,
      });
      expect(oversizedState.status).toBe(422);

      const oversizedNote = await api(page, `/api/notes/${article.id}`, "PUT", {
        content: "x".repeat(70 * 1024),
      });
      expect(oversizedNote.status).toBe(422);
      expect(oversizedNote.body?.error?.code).toBe("VALIDATION_ERROR");

      // 5. 事件按 UUID 去重，重放不产生新行
      const eventId = crypto.randomUUID();
      const eventPayload = {
        id: eventId,
        enrollmentId,
        lessonId: article.id,
        type: "step_interacted",
        stepId: "intro",
        payload: { attempt: 1 },
      };
      const event1 = await api<{ accepted: boolean; duplicate: boolean }>(
        page,
        "/api/learning/events",
        "POST",
        eventPayload,
      );
      const event2 = await api<{ accepted: boolean; duplicate: boolean }>(
        page,
        "/api/learning/events",
        "POST",
        eventPayload,
      );
      expect(event1.body?.data?.duplicate).toBe(false);
      expect(event2.body?.data?.duplicate).toBe(true);

      const db = serviceClient();
      const { count } = await db
        .from("activity_events")
        .select("id", { count: "exact", head: true })
        .eq("id", eventId);
      expect(count).toBe(1);

      // 6. 笔记仅自己可见
      const wroteNote = await api(page, `/api/notes/${article.id}`, "PUT", {
        content: "A 的私人笔记",
      });
      expect(wroteNote.status).toBe(200);

      const contextB = await browser.newContext();
      const pageB = await contextB.newPage();
      await login(pageB, studentB.email, studentB.password);

      const bReadsA = await api<{ content: string }>(pageB, `/api/notes/${article.id}`);
      expect(bReadsA.status).toBe(200);
      expect(bReadsA.body?.data?.content).toBe("");

      const bWrites = await api(pageB, `/api/notes/${article.id}`, "PUT", {
        content: "越权写入",
      });
      expect(bWrites.status).toBe(403);

      const bState = await api(pageB, `/api/learning/states/${lab.id}`);
      expect(bState.status).toBe(403);

      const bEvent = await api(pageB, "/api/learning/events", "POST", {
        id: crypto.randomUUID(),
        enrollmentId,
        lessonId: article.id,
        type: "step_interacted",
      });
      expect([403, 404]).toContain(bEvent.status);

      // 7. 题目答案不下发；失败可重试，通过后幂等
      await page.goto(`/learn/${course.id}?lesson=${quizLesson.id}`);
      await expect(page.getByText("最终测验", { exact: false }).first()).toBeVisible({
        timeout: 20_000,
      });
      const pageHtml = await page.content();
      expect(pageHtml).not.toContain('"answer"');
      expect(pageHtml).not.toContain('"explanation"');

      const failedAttemptId = crypto.randomUUID();
      const failedAttempt = await api<{ passed: boolean }>(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId: failedAttemptId,
          enrollmentId,
          lessonId: quizLesson.id,
          blockId: "final-assessment",
          submission: { answers: {} },
        },
      );
      expect(failedAttempt.status).toBe(200);
      expect(failedAttempt.body?.data?.passed).toBe(false);
      expect(await getPointsTotal(studentA.id)).toBe(10);

      const quizFile = JSON.parse(fs.readFileSync(QUIZ_FILE, "utf8")) as QuizFile;
      const answers: Record<string, string | string[]> = {};
      for (const question of quizFile.questions) answers[question.id] = question.answer;

      const passedAttemptId = crypto.randomUUID();
      const passedAttempt = await api<{ passed: boolean; pointsAwarded: number }>(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId: passedAttemptId,
          enrollmentId,
          lessonId: quizLesson.id,
          blockId: "final-assessment",
          submission: { answers },
        },
      );
      expect(passedAttempt.status).toBe(200);
      expect(passedAttempt.body?.data?.passed).toBe(true);
      expect(passedAttempt.body?.data?.pointsAwarded).toBe(60);
      expect(await getPointsTotal(studentA.id)).toBe(70);

      const replayAttempt = await api<{ duplicate: boolean; pointsAwarded?: number }>(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId: passedAttemptId,
          enrollmentId,
          lessonId: quizLesson.id,
          blockId: "final-assessment",
          submission: { answers },
        },
      );
      expect(replayAttempt.status).toBe(200);
      expect(replayAttempt.body?.data?.duplicate).toBe(true);
      expect(replayAttempt.body?.data?.pointsAwarded ?? 0).toBe(0);
      expect(await getPointsTotal(studentA.id)).toBe(70);

      const reusedAttempt = await api(
        page,
        "/api/learning/blocks/submit",
        "POST",
        {
          attemptId: passedAttemptId,
          enrollmentId,
          lessonId: quizLesson.id,
          blockId: "final-assessment",
          submission: { answers: {} },
        },
      );
      expect(reusedAttempt.status).toBe(409);
      expect(reusedAttempt.body?.error?.code).toBe("IDEMPOTENCY_KEY_REUSED");

      await contextB.close();
    } finally {
      await deleteTestStudent(studentA.id);
      await deleteTestStudent(studentB.id);
    }
  });

  test("学生无法通过客户端数据把 admin 端点或他人进度当作自己的", async ({ page }) => {
    const student = await createTestStudent("forged");
    try {
      await login(page, student.email, student.password);
      const result = await api(page, "/api/admin/students");
      expect(result.status).toBe(403);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});
