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
  return (await pool.query(text, values)).rows as T[];
}

export async function one<T = Record<string, unknown>>(
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
  const result = await query<{ data: T }>(
    `select public.${name}(${params}) as data`,
    keys.map((key) => args[key]),
  );
  return result[0].data;
}

export async function closeDb() {
  await pool.end();
}
