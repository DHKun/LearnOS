import { Client } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("集成测试需要 NEXT_PUBLIC_SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

let counter = 0;

export async function createTestUser(role: "student" | "admin") {
  const db = serviceClient();
  counter += 1;
  const email = `it-${role}-${Date.now()}-${counter}@learnos.local`;
  const password = "Integration-Test-2025!";
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `IT ${role} ${counter}` },
    app_metadata: { role },
  });
  if (error || !data.user) throw error ?? new Error("无法创建测试用户");

  const { error: profileError } = await db.from("profiles").upsert(
    {
      user_id: data.user.id,
      email,
      display_name: `IT ${role} ${counter}`,
      role,
      disabled_at: null,
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw profileError;

  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string) {
  const db = serviceClient();
  await db.auth.admin.deleteUser(userId);
}

export async function getCourse(slug = "sql-injection-basics") {
  const db = serviceClient();
  const { data, error } = await db
    .from("courses")
    .select("id,slug,status")
    .eq("slug", slug)
    .single();
  if (error) throw error;
  return data as { id: string; slug: string; status: string };
}

export async function getLessons(courseId: string) {
  const db = serviceClient();
  const { data, error } = await db
    .from("lessons")
    .select("id,slug,type,completion_policy,position,required,config")
    .eq("course_id", courseId)
    .order("position");
  if (error) throw error;
  return data as {
    id: string;
    slug: string;
    type: "article" | "interactive" | "quiz";
    completion_policy: string;
    position: number;
    required: boolean;
    config: Record<string, unknown>;
  }[];
}

export async function pointsTotal(studentId: string) {
  const db = serviceClient();
  const { data, error } = await db.rpc("student_points_total", { p_student: studentId });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function withRole<T>(
  userId: string | null,
  role: "authenticated" | "anon",
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const connectionString =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  const client = new Client({ connectionString });
  await client.connect();
  try {
    if (userId) {
      await client.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    await client.query(`set role ${role}`);
    return await fn(client);
  } finally {
    try {
      await client.query("reset role");
    } catch {
      // connection may be broken by a failed query; closing is enough
    }
    await client.end();
  }
}
