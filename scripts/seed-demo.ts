import "./env";

import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

import { one, query } from "./db";
import { syncCourses } from "./courses/sync";

const STUDENTS = [
  { email: "student1@learnos.local", password: "Student-One-2025!", displayName: "林小满" },
  { email: "student2@learnos.local", password: "Student-Two-2025!", displayName: "陈一鸣" },
];

async function main() {
  const summaries = await syncCourses({ publish: true });
  for (const summary of summaries) {
    console.log(`课程 ${summary.slug} 已同步（${summary.lessonCount} 章节）`);
  }

  for (const student of STUDENTS) {
    const existing = await one<{ id: string }>(
      "select id from public.\"user\" where email=$1",
      [student.email],
    );
    let userId = existing?.id;
    if (!userId) {
      userId = randomUUID();
      await query(
        `insert into public."user" (id,name,email,email_verified,created_at,updated_at)
         values ($1,$2,$3,true,now(),now())`,
        [userId, student.displayName, student.email],
      );
      const hash = await hashPassword(student.password);
      await query(
        `insert into public.account (id,account_id,provider_id,user_id,password,created_at,updated_at)
         values ($1,$2,'credential',$3,$4,now(),now())`,
        [randomUUID(), userId, userId, hash],
      );
    }
    await query(
      `insert into public.profiles (user_id,email,display_name,role)
       values ($1,$2,$3,'student')
       on conflict (user_id) do update set email=excluded.email, display_name=excluded.display_name`,
      [userId, student.email, student.displayName],
    );
    console.log(`学生 ${student.email} / ${student.password}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
