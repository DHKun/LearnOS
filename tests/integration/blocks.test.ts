import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  getCourse,
  getLessons,
  pointsTotal,
  serviceClient,
  withRole,
} from "./helpers";

type User = { id: string; email: string; password: string };

let student: User;
let courseId: string;
let enrollmentId: string;
let lessons: Awaited<ReturnType<typeof getLessons>>;

function lesson(slug: string) {
  const item = lessons.find((entry) => entry.slug === slug);
  if (!item) throw new Error(`missing lesson ${slug}`);
  return item;
}

async function saveBlock(input: {
  lessonSlug: string;
  blockId: string;
  kind: "simulation" | "question";
  passed: boolean;
  attemptId?: string;
  hash?: string;
  score?: number;
  feedback?: Record<string, unknown>;
}) {
  const db = serviceClient();
  const { data, error } = await db.rpc("save_block_result", {
    p_student: student.id,
    p_enrollment: enrollmentId,
    p_lesson: lesson(input.lessonSlug).id,
    p_block_id: input.blockId,
    p_block_kind: input.kind,
    p_attempt_id: input.attemptId ?? randomUUID(),
    p_request_hash: input.hash ?? randomUUID(),
    p_passed: input.passed,
    p_score: input.score ?? (input.passed ? 100 : 0),
    p_feedback: input.feedback ?? {},
  });
  return { data: data as Record<string, unknown>, error };
}

async function lessonStatus(slug: string) {
  const db = serviceClient();
  const { data } = await db
    .from("lesson_progress")
    .select("status")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lesson(slug).id)
    .maybeSingle();
  return data?.status ?? null;
}

async function blockResult(lessonSlug: string, blockId: string) {
  const db = serviceClient();
  const { data } = await db
    .from("block_results")
    .select("passed,attempts,first_passed_at")
    .eq("enrollment_id", enrollmentId)
    .eq("lesson_id", lesson(lessonSlug).id)
    .eq("block_id", blockId)
    .maybeSingle();
  return data;
}

beforeAll(async () => {
  student = await createTestUser("student");
  const course = await getCourse("http-fundamentals");
  courseId = course.id;
  lessons = await getLessons(courseId);
  const db = serviceClient();
  const { data, error } = await db.rpc("join_course", {
    p_student: student.id,
    p_course: courseId,
  });
  if (error) throw error;
  enrollmentId = (data as { id: string }).id;
});

afterAll(async () => {
  await deleteTestUser(student.id);
});

describe("混合章节 Block 完成与积分事务", () => {
  it("直接调用 complete_lesson 不能绕过 server_validated 章节", async () => {
    const db = serviceClient();
    const { error } = await db.rpc("complete_lesson", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lesson("request").id,
      p_source: "manual",
    });
    expect(error?.message).toContain("COMPLETION_NOT_ALLOWED");
    expect(await lessonStatus("request")).toBeNull();
  });

  it("失败实验只记录尝试，不完成章节、不发积分", async () => {
    const result = await saveBlock({
      lessonSlug: "request",
      blockId: "request-lab",
      kind: "simulation",
      passed: false,
    });
    expect(result.error).toBeNull();
    expect(result.data.blockStatus).toBe("failed");
    expect(result.data.chapterCompleted).toBe(false);
    expect(await lessonStatus("request")).toBeNull();
    expect(await pointsTotal(student.id)).toBe(0);
    expect((await blockResult("request", "request-lab"))?.passed).toBe(false);
  });

  it("通过实验后自动完成章节，且重复提交不重复发分", async () => {
    const attemptId = randomUUID();
    const first = await saveBlock({
      lessonSlug: "request",
      blockId: "request-lab",
      kind: "simulation",
      passed: true,
      attemptId,
      hash: "same-request",
    });
    expect(first.error).toBeNull();
    expect(first.data.chapterCompleted).toBe(true);
    expect(first.data.pointsAwarded).toBe(10);
    expect(await lessonStatus("request")).toBe("completed");
    expect(await pointsTotal(student.id)).toBe(10);

    const duplicate = await saveBlock({
      lessonSlug: "request",
      blockId: "request-lab",
      kind: "simulation",
      passed: true,
      attemptId,
      hash: "same-request",
    });
    expect(duplicate.data.duplicate).toBe(true);
    expect(duplicate.data.pointsAwarded).toBe(0);
    expect(await pointsTotal(student.id)).toBe(10);

    const replay = await saveBlock({
      lessonSlug: "request",
      blockId: "request-lab",
      kind: "simulation",
      passed: true,
    });
    expect(replay.data.duplicate).toBe(false);
    expect(replay.data.pointsAwarded).toBe(0);
    expect(await pointsTotal(student.id)).toBe(10);
    expect((await blockResult("request", "request-lab"))?.attempts).toBe(3);
  });

  it("同一 attempt ID 携带不同请求内容时拒绝", async () => {
    const attemptId = randomUUID();
    const first = await saveBlock({
      lessonSlug: "methods",
      blockId: "method-lab",
      kind: "simulation",
      passed: false,
      attemptId,
      hash: "hash-a",
    });
    expect(first.error).toBeNull();
    const second = await saveBlock({
      lessonSlug: "methods",
      blockId: "method-lab",
      kind: "simulation",
      passed: true,
      attemptId,
      hash: "hash-b",
    });
    expect(second.error?.message).toContain("IDEMPOTENCY_KEY_REUSED");
  });

  it("all 模式必须两个 Block 都通过；章节只发一次 10 分", async () => {
    const onlyLab = await saveBlock({
      lessonSlug: "methods",
      blockId: "method-lab",
      kind: "simulation",
      passed: true,
    });
    expect(onlyLab.data.chapterCompleted).toBe(false);
    expect(await lessonStatus("methods")).toBeNull();
    expect(await pointsTotal(student.id)).toBe(10);

    const both = await saveBlock({
      lessonSlug: "methods",
      blockId: "method-check",
      kind: "question",
      passed: true,
    });
    expect(both.data.chapterCompletionSatisfied).toBe(true);
    expect(both.data.chapterCompleted).toBe(true);
    expect(both.data.pointsAwarded).toBe(10);
    expect(await lessonStatus("methods")).toBe("completed");
    expect(await pointsTotal(student.id)).toBe(20);
  });

  it("Block 结果与 lesson/课程归属不匹配时拒绝", async () => {
    const db = serviceClient();
    const { error } = await db.rpc("save_block_result", {
      p_student: student.id,
      p_enrollment: enrollmentId,
      p_lesson: lesson("headers").id,
      p_block_id: "not-declared",
      p_block_kind: "question",
      p_attempt_id: randomUUID(),
      p_request_hash: "x",
      p_passed: true,
      p_score: 100,
      p_feedback: {},
    });
    expect(error?.message).toContain("BLOCK_NOT_FOUND");
  });

  it("浏览器角色不能直接读写 Block 可信结果", async () => {
    await expect(
      withRole(student.id, "authenticated", async (client) => {
        await client.query("select * from public.block_results");
      }),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withRole(student.id, "authenticated", async (client) => {
        await client.query("select * from public.block_attempts");
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
