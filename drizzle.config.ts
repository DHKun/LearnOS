import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./db/migrations",
  dbCredentials: {
    url:
      process.env.LEARNOS_DB_URL ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  },
});
