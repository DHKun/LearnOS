import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestUser,
  deleteTestUser,
  getCourse,
  getLessons,
  serviceClient,
  withRole,
} from "./helpers";

type User = { id: string; email: string; password: string };

describe("PostgreSQL RLS：角色隔离与写保护", () => {
  let studentA: User;
  let studentB: User;
  let admin: User;
  let lessonId: string;

  beforeAll(async () => {
    studentA = await createTestUser("student");
    studentB = await createTestUser("student");
    admin = await createTestUser("admin");

    const course = await getCourse("sql-injection-basics");
    const lessons = await getLessons(course.id);
    lessonId = lessons[0].id;

    const db = serviceClient();
    const { error: joinError } = await db.rpc("join_course", {
      p_student: studentA.id,
      p_course: course.id,
    });
    if (joinError) throw joinError;

    const { error: noteError } = await db.rpc("save_note", {
      p_student: studentA.id,
      p_lesson: lessonId,
      p_content: "A 的私人笔记",
    });
    if (noteError) throw noteError;
  });

  afterAll(async () => {
    await Promise.all([deleteTestUser(studentA.id), deleteTestUser(studentB.id), deleteTestUser(admin.id)]);
  });

  it("学生只能读取自己的 profile", async () => {
    const rows = await withRole(studentA.id, "authenticated", async (client) => {
      const result = await client.query("select user_id, role from public.profiles");
      return result.rows;
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(studentA.id);
  });

  it("学生读不到其他学生的 profile 与 enrollment", async () => {
    const result = await withRole(studentB.id, "authenticated", async (client) => {
      const profiles = await client.query("select user_id from public.profiles where user_id = $1", [
        studentA.id,
      ]);
      const enrollments = await client.query("select id from public.enrollments");
      return { profiles: profiles.rowCount, enrollments: enrollments.rowCount };
    });
    expect(result.profiles).toBe(0);
    expect(result.enrollments).toBe(0);
  });

  it("管理员可以读取全部学生与 enrollment，但读不到私人笔记", async () => {
    const result = await withRole(admin.id, "authenticated", async (client) => {
      const profiles = await client.query("select user_id from public.profiles");
      const enrollments = await client.query("select id from public.enrollments");
      const notes = await client.query("select content from public.notes");
      return { profiles: profiles.rowCount, enrollments: enrollments.rowCount, notes: notes.rowCount };
    });
    expect(result.profiles).toBeGreaterThanOrEqual(3);
    expect(result.enrollments).toBeGreaterThanOrEqual(1);
    expect(result.notes).toBe(0);
  });

  it("笔记仅所有者可读写", async () => {
    const own = await withRole(studentA.id, "authenticated", async (client) => {
      const notes = await client.query("select content from public.notes");
      return notes.rows;
    });
    expect(own).toHaveLength(1);
    expect(own[0].content).toBe("A 的私人笔记");

    const other = await withRole(studentB.id, "authenticated", async (client) => {
      const notes = await client.query("select content from public.notes");
      const update = await client.query("update public.notes set content = 'hacked'");
      return { notes: notes.rowCount, updated: update.rowCount };
    });
    expect(other.notes).toBe(0);
    expect(other.updated).toBe(0);
  });

  it("学生无法读取他人的积分流水", async () => {
    const db = serviceClient();
    const { error } = await db.rpc("complete_lesson", {
      p_student: studentA.id,
      p_enrollment: (
        await db.from("enrollments").select("id").eq("student_id", studentA.id).single()
      ).data!.id,
      p_lesson: lessonId,
      p_source: "manual",
    });
    if (error) throw error;

    const rows = await withRole(studentB.id, "authenticated", async (client) => {
      const result = await client.query("select id from public.point_events");
      return result.rowCount;
    });
    expect(rows).toBe(0);
  });

  it("浏览器角色不能直接写进度、积分或 profile 角色", async () => {
    await expect(
      withRole(studentA.id, "authenticated", async (client) => {
        await client.query(
          "insert into public.lesson_progress (enrollment_id, lesson_id, status) values ((select id from public.enrollments limit 1), $1, 'completed')",
          [lessonId],
        );
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withRole(studentA.id, "authenticated", async (client) => {
        await client.query(
          "insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key) values ($1, (select id from public.enrollments limit 1), 999, 'hack', 'hack')",
          [studentA.id],
        );
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withRole(studentA.id, "authenticated", async (client) => {
        await client.query("update public.profiles set role = 'admin' where user_id = $1", [
          studentA.id,
        ]);
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it("学生不能为他人创建笔记行（WITH CHECK）", async () => {
    await expect(
      withRole(studentA.id, "authenticated", async (client) => {
        await client.query(
          "insert into public.notes (student_id, lesson_id, content) values ($1, $2, 'forged')",
          [studentB.id, lessonId],
        );
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  it("匿名角色不能读取业务表", async () => {
    await expect(
      withRole(null, "anon", async (client) => {
        await client.query("select id from public.courses");
      }),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withRole(null, "anon", async (client) => {
        await client.query("select user_id from public.profiles");
      }),
    ).rejects.toThrow(/permission denied/i);
  });
});
