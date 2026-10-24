import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

/**
 * Direct PostgreSQL access. LearnOS no longer goes through PostgREST.
 *
 * The pool is created once per server process; Next.js dev reloads reuse it via
 * globalThis to avoid leaking connections during hot reload.
 */
const globalForDb = globalThis as unknown as { learnosPool?: Pool };

export const pool =
  globalForDb.learnosPool ??
  new Pool({
    connectionString:
      process.env.LEARNOS_DB_URL ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    max: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.learnosPool = pool;

export const db = drizzle(pool, { schema });
