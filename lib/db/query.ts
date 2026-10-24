import { sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db";
import { mapDatabaseError } from "@/lib/api/errors";

export function mapPgError(error: unknown): never {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) break;
    const cause = (current as { cause?: unknown }).cause;
    if (!cause) break;
    current = cause;
  }
  mapDatabaseError(current);
}

/** Run a raw parameterized query through Drizzle and return typed rows. */
export async function rows<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T[]> {
  try {
    const result = await db.execute(query);
    return result.rows as T[];
  } catch (error) {
    return mapPgError(error);
  }
}

export async function one<T extends Record<string, unknown>>(
  query: SQL,
): Promise<T | null> {
  const result = await rows<T>(query);
  return result[0] ?? null;
}

/**
 * Call a public SECURITY DEFINER function with named parameters.
 * Function and argument names are identifiers (never user input); values are
 * always bound parameters.
 */
export async function rpc<T = unknown>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const entries = Object.entries(args);
  const params = entries.map(
    ([key, value]) => sql`${sql.identifier(key)} => ${value}`,
  );
  const query = sql`select public.${sql.identifier(name)}(${sql.join(params, sql`, `)}) as result`;
  const row = await one<{ result: T }>(query);
  return row?.result as T;
}

/** Safe `ARRAY[...]::uuid[]` expression for `= any(...)` filters. */
export function uuidList(ids: string[]): SQL {
  if (ids.length === 0) return sql`array[]::uuid[]`;
  return sql`array[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;
}

/** Safe `ARRAY[...]::text[]` expression for `= any(...)` filters. */
export function textList(values: string[]): SQL {
  if (values.length === 0) return sql`array[]::text[]`;
  return sql`array[${sql.join(values.map((value) => sql`${value}::text`), sql`, `)}]::text[]`;
}
