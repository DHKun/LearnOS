import { randomUUID } from "node:crypto";

import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.LEARNOS_DB_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  max: 5,
});

export async function query<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(text, values);
  return result.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T | null> {
  return (await query<T>(text, values))[0] ?? null;
}

export async function rpc<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const keys = Object.keys(args);
  const params = keys.map((key, index) => `${key} => $${index + 1}`).join(", ");
  const rows = await query<{ data: T }>(`select public.${name}(${params}) as data`, keys.map((k) => args[k]));
  return rows[0].data;
}

export type TestStudent = {
  id: string;
  email: string;
  password: string;
  name: string;
};

let counter = 0;

export async function createTestStudent(label = "e2e"): Promise<TestStudent> {
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@learnos.local`;
  const password = "Student-E2E-2025!";
  const name = `E2E ${label} ${counter}`;
  const base = process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
  const response = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ email, password, name }),
  });
  if (!response.ok) throw new Error(`createTestStudent failed: ${response.status} ${await response.text()}`);
  const created = (await response.json()) as { user: { id: string } };
  const id = created.user.id;
  // The Better Auth database hook creates the profile automatically.
  return { id, email, password, name };
}

export async function deleteTestStudent(studentId: string): Promise<void> {
  await pool.query("delete from public.profiles where user_id = $1", [studentId]);
  await pool.query("delete from public.account where user_id = $1", [studentId]);
  await pool.query("delete from public.session where user_id = $1", [studentId]);
  await pool.query("delete from public.\"user\" where id = $1", [studentId]);
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "退出 LearnOS" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export type ApiResult<T = any> = { status: number; body: { data?: T; error?: any } | null };

export async function api<T = any>(
  page: Page,
  path: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<ApiResult<T>> {
  return page.evaluate(
    async ({ path, method, body }) => {
      const response = await fetch(path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "same-origin",
      });
      let json: any = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return { status: response.status, body: json };
    },
    { path, method, body },
  );
}

export async function getCourseBySlug(slug: string) {
  const row = await queryOne<{ id: string; slug: string; status: string }>(
    "select id,slug,status from public.courses where slug = $1 limit 1",
    [slug],
  );
  if (!row) throw new Error(`course not found: ${slug}`);
  return row;
}

export async function getLessons(courseId: string) {
  return query<{
    id: string;
    slug: string;
    title: string;
    type: "article" | "interactive" | "quiz";
    position: number;
    required: boolean;
    completion_policy: string;
    config: Record<string, unknown>;
  }>(
    `select id,slug,title,type,position,required,completion_policy,config
       from public.lessons where course_id = $1 order by position`,
    [courseId],
  );
}

export async function getEnrollments(studentId: string) {
  return query<{
    id: string;
    course_id: string;
    status: "active" | "completed" | "abandoned";
    current_lesson_id: string | null;
    last_seen_at: string | null;
    last_interaction_at: string | null;
  }>(
    `select id,course_id,status,current_lesson_id,last_seen_at,last_interaction_at
       from public.enrollments where student_id = $1 order by started_at`,
    [studentId],
  );
}

export async function createTestCourse(label: string) {
  const slug = `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const row = await queryOne<{ id: string; slug: string }>(
    `insert into public.courses (slug,title,description,status,content_version)
     values ($1,$2,'','published','1.0.0') returning id,slug`,
    [slug, `E2E ${label}`],
  );
  if (!row) throw new Error("failed to create test course");
  return row;
}

export async function deleteTestCourse(courseId: string) {
  await pool.query("delete from public.enrollments where course_id = $1", [courseId]);
  await pool.query("delete from public.courses where id = $1", [courseId]);
}

export async function completeRequiredChapters(
  studentId: string,
  courseId: string,
  enrollmentId: string,
) {
  const lessons = await getLessons(courseId);
  for (const lesson of lessons) {
    const config = lesson.config as {
      blocks?: { id: string; kind: "simulation" | "question" }[];
      completion?: { requiredBlocks?: string[] };
      finalExam?: boolean;
    };
    if (config.finalExam) continue;
    if (lesson.completion_policy === "manual") {
      await rpc("complete_lesson", {
        p_student: studentId,
        p_enrollment: enrollmentId,
        p_lesson: lesson.id,
        p_source: "manual",
      });
      continue;
    }
    const blocks = new Map((config.blocks ?? []).map((block) => [block.id, block]));
    for (const blockId of config.completion?.requiredBlocks ?? []) {
      const block = blocks.get(blockId);
      if (!block) throw new Error(`missing block ${lesson.slug}/${blockId}`);
      await rpc("save_block_result", {
        p_student: studentId,
        p_enrollment: enrollmentId,
        p_lesson: lesson.id,
        p_block_id: blockId,
        p_block_kind: block.kind,
        p_attempt_id: randomUUID(),
        p_request_hash: `e2e:${lesson.slug}:${blockId}`,
        p_passed: true,
        p_score: 100,
        p_feedback: {},
      });
    }
  }
}

export async function getEvents(enrollmentId: string) {
  return query<{
    event_type: string;
    payload: Record<string, unknown>;
    step_id: string | null;
    created_at: string;
  }>(
    `select event_type,payload,step_id,created_at from public.activity_events
      where enrollment_id=$1 order by created_at`,
    [enrollmentId],
  );
}

export async function getPointsTotal(studentId: string): Promise<number> {
  const value = await rpc<number>("student_points_total", { p_student: studentId });
  return Number(value ?? 0);
}

export async function closePool() {
  await pool.end();
}
