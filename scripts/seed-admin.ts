import "./env";

import { createAdminClient } from "@/lib/supabase/admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@learnos.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "LearnOS-Admin-2025!";
const ADMIN_NAME = process.env.ADMIN_NAME ?? "LearnOS 管理员";

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
  const existing = await findUserByEmail(ADMIN_EMAIL);

  if (!existing) {
    const { data, error } = await db.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: ADMIN_NAME },
      app_metadata: { role: "admin" },
    });
    if (error) throw error;
    console.log(`已创建管理员 ${ADMIN_EMAIL} (${data.user?.id})`);
  } else {
    const { error } = await db.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      app_metadata: { role: "admin" },
      ban_duration: "none",
    });
    if (error) throw error;
    console.log(`已更新管理员 ${ADMIN_EMAIL} (${existing.id})`);
  }

  const user = await findUserByEmail(ADMIN_EMAIL);
  if (!user) throw new Error("管理员账号创建后无法读取");

  const { error: profileError } = await db.from("profiles").upsert(
    {
      user_id: user.id,
      email: ADMIN_EMAIL,
      display_name: ADMIN_NAME,
      role: "admin",
      disabled_at: null,
    },
    { onConflict: "user_id" },
  );
  if (profileError) throw profileError;

  console.log(`\n管理员登录：${ADMIN_EMAIL}`);
  console.log(`初始密码：${ADMIN_PASSWORD}`);
  console.log("请在生产环境立即修改密码，并通过安全渠道保管。");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
