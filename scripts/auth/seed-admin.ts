import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/better";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");

  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  if (existing.length === 0) {
    const result = await auth.api.signUpEmail({ body: { email, password, name: "管理员" } });
    await db.update(profiles).set({ role: "admin" }).where(eq(profiles.userId, result.user.id));
    console.log("admin created", result.user.id);
  } else {
    await db.update(profiles).set({ role: "admin" }).where(eq(profiles.email, email));
    console.log("admin promoted", existing[0].userId);
  }
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
