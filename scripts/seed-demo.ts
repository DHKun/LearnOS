import "./env";

import { createAdminClient } from "@/lib/supabase/admin";
import { syncCourses } from "./courses/sync";

const STUDENTS = [
  {
    email: "student1@learnos.local",
    password: "Student-One-2025!",
    displayName: "林小满",
  },
  {
    email: "student2@learnos.local",
    password: "Student-Two-2025!",
    displayName: "陈一鸣",
  },
];

async function findUserByEmail(email: string) {
  const db = createAdminClient();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function main() {
  const db = createAdminClient();

  const summaries = await syncCourses({ publish: true });
  for (const summary of summaries) {
    console.log(`课程 ${summary.slug} 已同步（${summary.lessonCount} 章节）`);
  }

  for (const student of STUDENTS) {
    const existing = await findUserByEmail(student.email);
    let userId: string;

    if (existing) {
      const { error } = await db.auth.admin.updateUserById(existing.id, {
        password: student.password,
        email_confirm: true,
        user_metadata: { display_name: student.displayName },
        app_metadata: { role: "student" },
        ban_duration: "none",
      });
      if (error) throw error;
      userId = existing.id;
    } else {
      const { data, error } = await db.auth.admin.createUser({
        email: student.email,
        password: student.password,
        email_confirm: true,
        user_metadata: { display_name: student.displayName },
        app_metadata: { role: "student" },
      });
      if (error) throw error;
      if (!data.user) throw new Error(`创建学生 ${student.email} 失败`);
      userId = data.user.id;
    }

    const { error: profileError } = await db.from("profiles").upsert(
      {
        user_id: userId,
        email: student.email,
        display_name: student.displayName,
        role: "student",
        disabled_at: null,
      },
      { onConflict: "user_id" },
    );
    if (profileError) throw profileError;

    console.log(`学生 ${student.email} / ${student.password}`);
  }

  console.log("\n演示数据已就绪。可在 /admin/courses 确认课程已发布状态。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
