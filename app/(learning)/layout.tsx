import { AppShell } from "@/components/app-shell";
import { requireStudent } from "@/lib/auth/session";

export default async function LearningLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireStudent();
  return (
    <AppShell profile={profile} wide>
      {children}
    </AppShell>
  );
}
