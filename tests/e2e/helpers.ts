import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("E2E 需要 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestStudent = {
  id: string;
  email: string;
  password: string;
  name: string;
};

let counter = 0;

export async function createTestStudent(label = "e2e"): Promise<TestStudent> {
  const db = serviceClient();
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@learnos.local`;
  const password = "Student-E2E-2025!";
  const name = `E2E ${label} ${counter}`;

  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: name },
    app_metadata: { role: "student" },
  });
  if (error || !data.user) throw error ?? new Error("创建测试学生失败");

  const { error: profileError } = await db.from("profiles").upsert(
    {
      user_id: data.user.id,
      email,
      display_name: name,
      role: "student",
      disabled_at: null,
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw profileError;

  return { id: data.user.id, email, password, name };
}

export async function deleteTestStudent(studentId: string): Promise<void> {
  const db = serviceClient();
  await db.auth.admin.deleteUser(studentId);
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

export async function logout(page: Page): Promise<void> {
  await page.getByRole("button", { name: "退出" }).click();
  await expect(page).toHaveURL(/\/login/);
}

export type ApiResult<T = any> = { status: number; body: { data?: T; error?: any } | null };

/** Same-origin browser fetch so cookies, Origin and CSP behave like real UI calls. */
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
  const db = serviceClient();
  const { data, error } = await db.from("courses").select("id,slug,status").eq("slug", slug).single();
  if (error) throw error;
  return data as { id: string; slug: string; status: string };
}

export async function getLessons(courseId: string) {
  const db = serviceClient();
  const { data, error } = await db
    .from("lessons")
    .select("id,slug,title,type,position,required")
    .eq("course_id", courseId)
    .order("position");
  if (error) throw error;
  return data as {
    id: string;
    slug: string;
    title: string;
    type: "article" | "interactive" | "quiz";
    position: number;
    required: boolean;
  }[];
}

export async function getEnrollments(studentId: string) {
  const db = serviceClient();
  const { data, error } = await db
    .from("enrollments")
    .select("id,course_id,status,current_lesson_id,last_seen_at,last_interaction_at")
    .eq("student_id", studentId)
    .order("started_at");
  if (error) throw error;
  return data as {
    id: string;
    course_id: string;
    status: "active" | "completed" | "abandoned";
    current_lesson_id: string | null;
    last_seen_at: string | null;
    last_interaction_at: string | null;
  }[];
}

export async function getEvents(enrollmentId: string) {
  const db = serviceClient();
  const { data, error } = await db
    .from("activity_events")
    .select("event_type,payload,step_id,created_at")
    .eq("enrollment_id", enrollmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as {
    event_type: string;
    payload: Record<string, unknown>;
    step_id: string | null;
    created_at: string;
  }[];
}

export async function getPointsTotal(studentId: string): Promise<number> {
  const db = serviceClient();
  const { data, error } = await db.rpc("student_points_total", { p_student: studentId });
  if (error) throw error;
  return Number(data ?? 0);
}
