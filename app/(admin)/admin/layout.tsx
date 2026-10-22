import { AppShell } from "@/components/app-shell";
import { requireAdmin } from "@/lib/auth/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdmin();
  return <AppShell profile={profile}>{children}</AppShell>;
}
