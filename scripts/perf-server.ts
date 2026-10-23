import fs from "node:fs";
import path from "node:path";

import { config as loadEnv } from "dotenv";

import { createAdminClient } from "@/lib/supabase/admin";
import * as admin from "@/lib/services/admin";
import * as courses from "@/lib/services/courses";
import * as loader from "@/lib/content/loader";
import * as headings from "@/lib/content/headings";

loadEnv({ path: ".env.local" });
loadEnv();

const originalFetch = globalThis.fetch;
let fetchCount = 0;
globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  fetchCount += 1;
  return originalFetch(input, init);
}) as typeof fetch;

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const label = String(args.label ?? `server-${new Date().toISOString().slice(0, 19)}`);
const iterations = Number(args.iterations ?? 20);

function round(value: number) {
  return Math.round(value * 100) / 100;
}

async function main() {
  const db = createAdminClient();
  const email = `micro-${Date.now()}@learnos.local`;
  const { data: user, error: userError } = await db.auth.admin.createUser({
    email,
    password: "Micro-Bench-2025!",
    email_confirm: true,
    user_metadata: { display_name: "Micro Bench" },
    app_metadata: { role: "student" },
  });
  if (userError || !user.user) throw userError ?? new Error("create user failed");
  const userId = user.user.id;

  const { data: course, error: courseError } = await db
    .from("courses")
    .select("id,slug")
    .eq("slug", "sql-injection-basics")
    .single();
  if (courseError) throw courseError;

  const { data: lessons, error: lessonsError } = await db
    .from("lessons")
    .select("id,slug,type")
    .eq("course_id", course.id)
    .order("position");
  if (lessonsError) throw lessonsError;

  const { error: joinError } = await db.rpc("join_course", {
    p_student: userId,
    p_course: course.id,
  });
  if (joinError) throw joinError;

  const articleLesson = lessons.find((lesson) => lesson.type === "article")!;
  const loaded = loader.loadCourse(course.slug);
  const articleManifest = loaded.manifest.lessons.find(
    (lesson) => lesson.slug === articleLesson.slug,
  )!;
  const articleSource = loader.readArticleSource(loaded, articleManifest);

  async function time(name: string, fn: () => unknown) {
    await fn();
    const values: number[] = [];
    let requests = 0;
    for (let index = 0; index < iterations; index += 1) {
      fetchCount = 0;
      const start = performance.now();
      await fn();
      values.push(performance.now() - start);
      requests += fetchCount;
    }
    values.sort((a, b) => a - b);
    return {
      name,
      median: round(values[Math.floor(values.length / 2)]),
      min: round(values[0]),
      requests: Math.round((requests / iterations) * 100) / 100,
    };
  }

  const results = [];
  try {
    results.push(
      await time("getCourseDetailBySlug", () => courses.getCourseDetailBySlug(course.slug, userId)),
    );
    results.push(await time("getCurrentEnrollment", () => courses.getCurrentEnrollment(userId)));
    results.push(await time("listStudentCourses", () => courses.listStudentCourses(userId)));
    results.push(await time("getAdminOverview", () => admin.getAdminOverview()));
    results.push(
      await time("listStudents", () => admin.listStudents({ page: 1, pageSize: 20 })),
    );
    results.push(await time("getStudentDetail", () => admin.getStudentDetail(userId)));
    results.push(
      await time("getAdminCourseDetail", () => courses.getAdminCourseDetail(course.id)),
    );
    results.push(
      await time("getAdminCourseStudents", () =>
        admin.listCourseStudents(course.id, { page: 1, pageSize: 50 }),
      ),
    );
    results.push(await time("loadCourse", () => loader.loadCourse(course.slug)));
    results.push(
      await time("readArticleSource", () =>
        loader.readArticleSource(loaded, articleManifest),
      ),
    );
    results.push(await time("extractHeadings", () => headings.extractHeadings(articleSource)));

    const dir = path.join(process.cwd(), ".perf");
    fs.mkdirSync(dir, { recursive: true });
    const result = {
      label,
      timestamp: new Date().toISOString(),
      iterations,
      results,
    };
    fs.writeFileSync(path.join(dir, `${label}.json`), JSON.stringify(result, null, 2));
    fs.appendFileSync(path.join(dir, "server-history.jsonl"), `${JSON.stringify(result)}\n`);

    const previous = fs
      .readdirSync(dir)
      .filter(
        (file) => file.startsWith("server-") && file.endsWith(".json") && file !== `${label}.json`,
      )
      .map((file) => ({ file, mtime: fs.statSync(path.join(dir, file)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)[0];
    const before = previous
      ? JSON.parse(fs.readFileSync(path.join(dir, previous.file), "utf8"))
      : null;

    console.log(`\nServer perf: ${label} (${iterations} iterations, median/min ms)`);
    for (const row of results) {
      const old = before?.results?.find((item: { name: string }) => item.name === row.name);
      const delta = old
        ? `${row.median - old.median >= 0 ? "+" : ""}${(row.median - old.median).toFixed(2)}`
        : "—";
      console.log(
        `${row.name.padEnd(24)} ${String(row.median).padStart(7)} / ${String(row.min).padStart(7)}  q=${String(row.requests).padStart(2)}  ${old ? old.median : "—"}  ${delta}`,
      );
    }
  } finally {
    await db.auth.admin.deleteUser(userId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
