import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStudent();
  return <AppShell profile={profile}>{children}</AppShell>;
}
