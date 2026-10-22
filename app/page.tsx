import { redirect } from "next/navigation";

import { getSessionProfile } from "@/lib/auth/session";

export default async function HomePage() {
  const profile = await getSessionProfile();
  if (!profile) redirect("/login");
  if (profile.disabledAt) redirect("/login?reason=disabled");
  redirect(profile.role === "admin" ? "/admin" : "/courses");
}
