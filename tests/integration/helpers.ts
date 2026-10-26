import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.LEARNOS_DB_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  max: 5,
});

type Filter = { column: string; value: unknown };
type DbResult<T = unknown> = { data: T | null; error: { message: string; code?: string } | null };

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

class PgQuery<T = any> implements PromiseLike<DbResult<T>> {
  private operation: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private payload: Record<string, unknown> | null = null;
  private mode: "many" | "single" | "maybeSingle" = "many";
  private wantsCount = false;

  constructor(private readonly table: string) {}

  select(columns = "*", options?: { count?: string; head?: boolean }) {
    // Supabase chains allow .insert(...).select(...); only switch to SELECT
    // when no mutation is pending.
    if (this.operation === "select") this.columns = columns;
    this.wantsCount = options?.count === "exact";
    return this;
  }
  insert(payload: Record<string, unknown>) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.operation = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }
  limit(value: number) {
    this.max = value;
    return this;
  }
  single() {
    this.mode = "single";
    return this.run();
  }
  maybeSingle() {
    this.mode = "maybeSingle";
    return this.run();
  }
  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private where(): { sql: string; values: unknown[] } {
    if (this.filters.length === 0) return { sql: "", values: [] };
    return {
      sql: ` where ${this.filters.map((f, i) => `${quote(f.column)} = $${i + 1}`).join(" and ")}`,
      values: this.filters.map((f) => f.value),
    };
  }

  private async run(): Promise<DbResult<T>> {
    try {
      const where = this.where();
      let text = "";
      let values: unknown[] = where.values;
      if (this.operation === "insert") {
        const keys = Object.keys(this.payload ?? {});
        text = `insert into public.${quote(this.table)} (${keys.map(quote).join(",")})
          values (${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`;
        values = Object.values(this.payload ?? {});
      } else if (this.operation === "update") {
        const keys = Object.keys(this.payload ?? {});
        text = `update public.${quote(this.table)} set ${keys
          .map((key, i) => `${quote(key)} = $${i + 1}`)
          .join(",")}${where.sql.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + keys.length}`)} returning *`;
        values = [...Object.values(this.payload ?? {}), ...where.values];
      } else if (this.operation === "delete") {
        text = `delete from public.${quote(this.table)}${where.sql}`;
      } else if (this.wantsCount) {
        text = `select count(*)::int as count from public.${quote(this.table)}${where.sql}`;
      } else {
        text = `select ${this.columns === "*" ? "*" : this.columns.split(",").map((c) => quote(c.trim())).join(",")}
          from public.${quote(this.table)}${where.sql}`;
        if (this.orderBy) text += ` order by ${quote(this.orderBy.column)} ${this.orderBy.ascending ? "asc" : "desc"}`;
        if (this.max !== null) text += ` limit ${this.max}`;
      }

      const result = await pool.query(text, values);
      let data: unknown;
      if (this.wantsCount) data = result.rows[0]?.count ?? 0;
      else if (this.operation === "delete") data = null;
      else if (this.mode === "single") data = result.rows[0] ?? null;
      else if (this.mode === "maybeSingle") data = result.rows[0] ?? null;
      else data = result.rows;
      const normalize = (value: unknown): unknown => {
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.map(normalize);
        if (value && typeof value === "object") {
          return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [key, normalize(nested)]),
          );
        }
        return value;
      };
      return { data: normalize(data) as T | null, error: null };
    } catch (error) {
      const record = error as { message?: string; code?: string };
      return { data: null, error: { message: record.message ?? "database error", code: record.code } };
    }
  }
}

export function serviceClient() {
  return {
    from<T = unknown>(table: string) {
      return new PgQuery<T>(table);
    },
    async rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<DbResult<T>> {
      const keys = Object.keys(args);
      try {
        const result = await pool.query(
          `select public.${name}(${keys.map((key, i) => `${key} => $${i + 1}`).join(", ")}) as data`,
          keys.map((key) => args[key]),
        );
        return { data: result.rows[0]?.data as T, error: null };
      } catch (error) {
        const record = error as { message?: string; code?: string };
        return { data: null, error: { message: record.message ?? "database error", code: record.code } };
      }
    },
    auth: {
      admin: {
        async createUser(input: {
          email: string;
          password: string;
          user_metadata?: { display_name?: string };
          app_metadata?: { role?: string };
        }) {
          try {
            const id = randomUUID();
            const hash = await hashPassword(input.password);
            const name = input.user_metadata?.display_name ?? input.email;
            await pool.query(
              `insert into public."user" (id,name,email,email_verified,created_at,updated_at)
               values ($1,$2,$3,true,now(),now())`,
              [id, name, input.email],
            );
            await pool.query(
              `insert into public.account (id,account_id,provider_id,user_id,password,created_at,updated_at)
               values ($1,$2,'credential',$3,$4,now(),now())`,
              [randomUUID(), id, id, hash],
            );
            await pool.query(
              `insert into public.profiles (user_id,email,display_name,role)
               values ($1,$2,$3,$4)`,
              [id, input.email, name, input.app_metadata?.role ?? "student"],
            );
            return { data: { user: { id, email: input.email } }, error: null };
          } catch (error) {
            return { data: null, error: { message: (error as Error).message } };
          }
        },
        async deleteUser(id: string) {
          await pool.query("delete from public.profiles where user_id=$1", [id]);
          await pool.query("delete from public.account where user_id=$1", [id]);
          await pool.query("delete from public.session where user_id=$1", [id]);
          await pool.query('delete from public."user" where id=$1', [id]);
          return { data: null, error: null };
        },
      },
    },
  };
}

export async function createTestUser(role: "student" | "admin") {
  const db = serviceClient();
  const email = `it-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@learnos.local`;
  const password = "Integration-Test-2025!";
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    user_metadata: { display_name: `IT ${role}` },
    app_metadata: { role },
  });
  if (error || !data?.user) throw new Error(error?.message ?? "无法创建测试用户");
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userId: string) {
  await serviceClient().auth.admin.deleteUser(userId);
}

export async function getCourse(slug = "http-hands-on") {
  const { data, error } = await serviceClient().from<{ id: string; slug: string; status: string }>("courses").select("id,slug,status").eq("slug", slug).single();
  if (error || !data) throw new Error(error?.message ?? "course not found");
  return data;
}

export async function createTestCourse(label: string) {
  const slug = `it-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { data, error } = await serviceClient().from<{ id: string; slug: string }>("courses").insert({
    slug,
    title: `IT ${label}`,
    description: "",
    status: "published",
    content_version: "1.0.0",
  }).select("id,slug").single();
  if (error || !data) throw new Error(error?.message ?? "course create failed");
  return data;
}

export async function deleteTestCourse(courseId: string) {
  await serviceClient().from("enrollments").delete().eq("course_id", courseId);
  await serviceClient().from("courses").delete().eq("id", courseId);
}

export type TestLesson = {
  id: string; slug: string; type: string; completion_policy: string;
  position: number; required: boolean; config: Record<string, unknown>;
};

export async function getLessons(courseId: string): Promise<TestLesson[]> {
  const { data, error } = await serviceClient().from<TestLesson>("lessons").select("id,slug,type,completion_policy,position,required,config").eq("course_id", courseId).order("position");
  if (error || !data) throw new Error(error?.message ?? "lessons not found");
  return data as unknown as TestLesson[];
}

export async function pointsTotal(studentId: string) {
  const { data, error } = await serviceClient().rpc<number>("student_points_total", { p_student: studentId });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

/** RLS is removed; this helper remains for tests that explicitly set a DB role. */
export async function withRole<T>(
  _userId: string | null,
  _role: "authenticated" | "anon",
  fn: (client: import("pg").Client) => Promise<T>,
): Promise<T> {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.LEARNOS_DB_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
