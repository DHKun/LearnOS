import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getPoints } from "@/lib/services/points";

import {
  createTestCourse,
  createTestUser,
  deleteTestCourse,
  deleteTestUser,
  getCourse,
  getLessons,
  pointsTotal,
  serviceClient,
} from "./helpers";

type Lesson = Awaited<ReturnType<typeof getLessons>>[number];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("数据库事务函数：报名、心跳、状态、完成与积分", () => {
  let student: { id: string; email: string; password: string };
  let otherStudent: { id: string; email: string; password: string };
  let courseId: string;
  let lessons: Lesson[];
  let enrollmentId: string;

  const db = () => serviceClient();

  async function rpc<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await db().rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  }

  async function getEnrollment(id = enrollmentId) {
    const { data, error } = await db()
      .from("enrollments")
      .select("id,status,current_lesson_id,last_seen_at,last_interaction_at,completed_at")
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as {
      id: string;
      status: string;
      current_lesson_id: string | null;
      last_seen_at: string | null;
      last_interaction_at: string | null;
      completed_at: string | null;
    };
  }

  beforeAll(async () => {
    student = await createTestUser("student");
    otherStudent = await createTestUser("student");
    const course = await getCourse("http-fundamentals");
    courseId = course.id;
    lessons = await getLessons(courseId);

    const enrollment = await rpc<{ id: string }>("join_course", {
      p_student: student.id,
      p_course: courseId,
    });
    enrollmentId = enrollment.id;
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(student.id), deleteTestUser(otherStudent.id)]);
  });

  it("重复参加同一课程幂等，不新建记录", async () => {
    const again = await rpc<{ id: string }>("join_course", {
      p_student: student.id,
      p_course: courseId,
    });
    expect(again.id).toBe(enrollmentId);

    const { count } = await db()
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("student_id", student.id);
    expect(count).toBe(1);
  });

  it("心跳更新 last_seen_at；只有章节变化或交互更新 last_interaction_at", async () => {
    const before = await getEnrollment();
    expect(before.last_interaction_at).toBeNull();

    const firstLesson = lessons[0];
    await rpc("heartbeat", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: firstLesson.id,
      p_visible: true,
      p_focused: true,
    });
    const afterFirst = await getEnrollment();
    expect(afterFirst.last_seen_at).not.toBeNull();
    expect(afterFirst.last_interaction_at).not.toBeNull();

    const { data: lessonState } = await db()
      .from("lesson_progress")
      .select("status")
      .eq("enrollment_id", enrollmentId)
      .eq("lesson_id", firstLesson.id)
      .maybeSingle();
    expect(lessonState?.status).toBe("in_progress");

    await sleep(40);
    await rpc("heartbeat", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: firstLesson.id,
      p_visible: true,
      p_focused: true,
    });
    const afterSecond = await getEnrollment();
    expect(new Date(afterSecond.last_seen_at!).getTime()).toBeGreaterThanOrEqual(
      new Date(afterFirst.last_seen_at!).getTime(),
    );
    expect(afterSecond.last_interaction_at).toBe(afterFirst.last_interaction_at);

    await sleep(40);
    await rpc("record_event", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: firstLesson.id,
      p_event_id: randomUUID(),
      p_type: "step_interacted",
      p_step: "intro",
      p_payload: { ok: true },
    });
    const afterEvent = await getEnrollment();
    expect(new Date(afterEvent.last_interaction_at!).getTime()).toBeGreaterThan(
      new Date(afterFirst.last_interaction_at!).getTime(),
    );
  });

  it("事件按 id 幂等", async () => {
    const eventId = randomUUID();
    const args = {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lessons[0].id,
      p_event_id: eventId,
      p_type: "step_interacted",
      p_step: "intro",
      p_payload: {},
    };
    const first = await rpc<{ duplicate: boolean }>("record_event", args);
    const second = await rpc<{ duplicate: boolean }>("record_event", args);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    const { count } = await db()
      .from("activity_events")
      .select("id", { count: "exact", head: true })
      .eq("id", eventId);
    expect(count).toBe(1);
  });

  it("互动状态使用 expectedVersion 乐观锁", async () => {
    const first = await rpc<{ version: number }>("save_state", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lessons[0].id,
      p_state: { step: "one" },
      p_expected_version: 0,
    });
    expect(first.version).toBe(1);

    await expect(
      rpc("save_state", {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: lessons[0].id,
        p_state: { step: "stale" },
        p_expected_version: 0,
      }),
    ).rejects.toThrow("STATE_VERSION_CONFLICT");

    const second = await rpc<{ version: number }>("save_state", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lessons[0].id,
      p_state: { step: "two" },
      p_expected_version: 1,
    });
    expect(second.version).toBe(2);
  });

  it("首次状态并发写入只有一个成功，另一个返回版本冲突", async () => {
    const args = {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lessons[1].id,
      p_state: { step: "first" },
      p_expected_version: 0,
    };
    const results = await Promise.allSettled([
      rpc("save_state", args),
      rpc("save_state", args),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toContain("STATE_VERSION_CONFLICT");
  });

  it("完成图文章节幂等，积分只发一次", async () => {
    const articles = lessons.filter((lesson) => lesson.completion_policy === "manual");
    const awards: number[] = [];
    for (const article of articles) {
      const result = await rpc<{ pointsAwarded: number }>("complete_lesson", {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: article.id,
        p_source: "manual",
      });
      awards.push(result.pointsAwarded);
    }
    expect(awards).toEqual(articles.map(() => 10));

    const second = await rpc<{ pointsAwarded: number; alreadyCompleted: boolean }>(
      "complete_lesson",
      {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: articles[0].id,
        p_source: "manual",
      },
    );
    expect(second.pointsAwarded).toBe(0);
    expect(second.alreadyCompleted).toBe(true);
    expect(await pointsTotal(student.id)).toBe(articles.length * 10);
  });

  it("server_validated 章节拒绝直接 complete，Block 结果由事务判定", async () => {
    const lab = lessons.find((lesson) => lesson.slug === "request")!;
    const manualAwards = lessons.filter(
      (lesson) => lesson.completion_policy === "manual",
    ).length * 10;
    await expect(
      rpc("complete_lesson", {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: lab.id,
        p_source: "manual",
      }),
    ).rejects.toThrow("COMPLETION_NOT_ALLOWED");

    const failedId = randomUUID();
    const failed = await rpc<{ passed: boolean; pointsAwarded?: number }>("save_block_result", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lab.id,
      p_block_id: "request-lab",
      p_block_kind: "simulation",
      p_attempt_id: failedId,
      p_request_hash: "hash-false",
      p_passed: false,
      p_score: 0,
      p_feedback: { message: "not safe" },
    });
    expect(failed.passed).toBe(false);
    expect(await pointsTotal(student.id)).toBe(manualAwards);

    const passedId = randomUUID();
    const passed = await rpc<{ passed: boolean; pointsAwarded: number }>(
      "save_block_result",
      {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: lab.id,
        p_block_id: "request-lab",
        p_block_kind: "simulation",
        p_attempt_id: passedId,
        p_request_hash: "hash-true",
        p_passed: true,
        p_score: 100,
        p_feedback: { message: "safe" },
      },
    );
    expect(passed.passed).toBe(true);
    expect(passed.pointsAwarded).toBe(10);

    const duplicate = await rpc<{ duplicate: boolean; pointsAwarded?: number }>(
      "save_block_result",
      {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: lab.id,
        p_block_id: "request-lab",
        p_block_kind: "simulation",
        p_attempt_id: passedId,
        p_request_hash: "hash-true",
        p_passed: true,
        p_score: 100,
        p_feedback: {},
      },
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.pointsAwarded ?? 0).toBe(0);
    expect(await pointsTotal(student.id)).toBe(manualAwards + 10);

    await expect(
      rpc("save_block_result", {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: lab.id,
        p_block_id: "request-lab",
        p_block_kind: "simulation",
        p_attempt_id: passedId,
        p_request_hash: "different-payload",
        p_passed: true,
        p_score: 100,
        p_feedback: {},
      }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("最终测验使用必需 Block，重复提交不重复发分并结课", async () => {
    const finalLesson = lessons.find((lesson) => lesson.slug === "final")!;

    // Complete every other required chapter so the final exam actually closes
    // the course. Manual chapters were completed above; request-lab already
    // passed. The remaining chapters are server-validated blocks.
    for (const lesson of lessons) {
      if (!lesson.required || lesson.slug === "final" || lesson.slug === "request") continue;
      if (lesson.completion_policy === "manual") continue;
      const config = lesson.config as {
        blocks?: { id: string; kind: "simulation" | "question" }[];
        completion?: { requiredBlocks?: string[] };
      };
      const blocks = new Map((config.blocks ?? []).map((block) => [block.id, block]));
      for (const blockId of config.completion?.requiredBlocks ?? []) {
        const block = blocks.get(blockId);
        if (!block) throw new Error(`missing block ${lesson.slug}/${blockId}`);
        await rpc("save_block_result", {
          p_student: student.id,
          p_enrollment: enrollmentId,
          p_lesson: lesson.id,
          p_block_id: blockId,
          p_block_kind: block.kind,
          p_attempt_id: randomUUID(),
          p_request_hash: `${lesson.slug}:${blockId}:pass`,
          p_passed: true,
          p_score: 100,
          p_feedback: {},
        });
      }
    }
    expect(await pointsTotal(student.id)).toBe(140);
    const before = await pointsTotal(student.id);

    const failedAttempt = randomUUID();
    const failed = await rpc<{ passed: boolean; pointsAwarded?: number }>("save_block_result", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: finalLesson.id,
      p_block_id: "final-check",
      p_block_kind: "question",
      p_attempt_id: failedAttempt,
      p_request_hash: "answers-failed",
      p_passed: false,
      p_score: 20,
      p_feedback: { correct: 1, total: 5 },
    });
    expect(failed.passed).toBe(false);
    expect(await pointsTotal(student.id)).toBe(before);

    const passAttempt = randomUUID();
    const passed = await rpc<{
      passed: boolean;
      pointsAwarded: number;
      enrollmentStatus: string;
    }>("save_block_result", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: finalLesson.id,
      p_block_id: "final-check",
      p_block_kind: "question",
      p_attempt_id: passAttempt,
      p_request_hash: "answers-v1",
      p_passed: true,
      p_score: 100,
      p_feedback: { correct: 5, total: 5 },
    });
    expect(passed.passed).toBe(true);
    expect(passed.pointsAwarded).toBe(60);
    expect(passed.enrollmentStatus).toBe("completed");
    expect(await pointsTotal(student.id)).toBe(before + 60);

    const duplicate = await rpc<{ duplicate: boolean; pointsAwarded?: number }>(
      "save_block_result",
      {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: finalLesson.id,
        p_block_id: "final-check",
        p_block_kind: "question",
        p_attempt_id: passAttempt,
        p_request_hash: "answers-v1",
        p_passed: true,
        p_score: 100,
        p_feedback: {},
      },
    );
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.pointsAwarded ?? 0).toBe(0);
    expect(await pointsTotal(student.id)).toBe(before + 60);

    await expect(
      rpc("save_block_result", {
        p_student: student.id,
        p_enrollment: enrollmentId,
        p_lesson: finalLesson.id,
        p_block_id: "final-check",
        p_block_kind: "question",
        p_attempt_id: passAttempt,
        p_request_hash: "different-answers",
        p_passed: true,
        p_score: 100,
        p_feedback: {},
      }),
    ).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("全部必修完成后课程 released（completed），可参加新课程", async () => {
    const completed = await getEnrollment();
    expect(completed.status).toBe("completed");
    expect(completed.completed_at).not.toBeNull();

    const otherCourse = await createTestCourse("other");
    try {
      const joined = await rpc<{ id: string; status: string }>("join_course", {
        p_student: student.id,
        p_course: otherCourse.id,
      });
      expect(joined.status).toBe("active");

      const { count } = await db()
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", student.id)
        .eq("status", "active");
      expect(count).toBe(1);
    } finally {
      await deleteTestCourse(otherCourse.id);
    }
  });

  it("并发参加不同课程时数据库只保留一条 active", async () => {
    const concurrencyStudent = await createTestUser("student");
    try {
      const courseA = await createTestCourse("concurrent-a");
      const courseB = await createTestCourse("concurrent-b");
      try {
        const results = await Promise.allSettled([
          rpc("join_course", { p_student: concurrencyStudent.id, p_course: courseA.id }),
          rpc("join_course", { p_student: concurrencyStudent.id, p_course: courseB.id }),
        ]);

        const fulfilled = results.filter((result) => result.status === "fulfilled");
        const rejected = results.filter(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(String(rejected[0].reason)).toContain("ACTIVE_COURSE_EXISTS");

        const { count } = await db()
          .from("enrollments")
          .select("id", { count: "exact", head: true })
          .eq("student_id", concurrencyStudent.id)
          .eq("status", "active");
        expect(count).toBe(1);
      } finally {
        await deleteTestCourse(courseA.id);
        await deleteTestCourse(courseB.id);
      }
    } finally {
      await deleteTestUser(concurrencyStudent.id);
    }
  });

  it("部分唯一索引直接阻止第二条 active 记录", async () => {
    const directStudent = await createTestUser("student");
    try {
      const courseA = await createTestCourse("direct-a");
      const courseB = await createTestCourse("direct-b");
      try {
        await rpc("join_course", { p_student: directStudent.id, p_course: courseA.id });

        const { error } = await db().from("enrollments").insert({
          student_id: directStudent.id,
          course_id: courseB.id,
          status: "active",
        });
        expect(error).not.toBeNull();
        expect(error?.code).toBe("23505");
      } finally {
        await deleteTestCourse(courseA.id);
        await deleteTestCourse(courseB.id);
      }
    } finally {
      await deleteTestUser(directStudent.id);
    }
  });

  it("跨用户不能操作他人的 enrollment", async () => {
    await expect(
      rpc("complete_lesson", {
        p_student: otherStudent.id,
        p_enrollment: enrollmentId,
        p_lesson: lessons[0].id,
        p_source: "manual",
      }),
    ).rejects.toThrow("ENROLLMENT_NOT_FOUND");

    await expect(
      rpc("save_note", {
        p_student: otherStudent.id,
        p_lesson: lessons[0].id,
        p_content: "not enrolled",
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("积分总数使用数据库聚合，不受明细 1000 条限制", async () => {
    const bulkStudent = await createTestUser("student");
    try {
      const course = await getCourse("http-fundamentals");
      const joined = await rpc<{ id: string }>("join_course", {
        p_student: bulkStudent.id,
        p_course: course.id,
      });
      const rows = Array.from({ length: 1005 }, (_, index) => ({
        student_id: bulkStudent.id,
        enrollment_id: joined.id,
        delta: 1,
        reason: "bulk_test",
        dedupe_key: `bulk:${joined.id}:${index}`,
      }));
      const { error } = await db().from("point_events").insert(rows);
      expect(error).toBeNull();

      const points = await getPoints(bulkStudent.id);
      expect(points.total).toBe(1005);
      expect(points.items.length).toBe(1000);
      expect(await pointsTotal(bulkStudent.id)).toBe(1005);
    } finally {
      await deleteTestUser(bulkStudent.id);
    }
  });
});
