import Image from "next/image";
import Link from "next/link";

import { signOutAction } from "@/lib/auth/actions";
import { NavigationProgress } from "@/components/navigation-progress";
import { ThemeToggle } from "@/components/theme-toggle";
import { NavLinks, type NavItem } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import type { SessionProfile } from "@/lib/auth/session";

const STUDENT_NAV: NavItem[] = [
  { href: "/courses", label: "课程" },
  { href: "/me", label: "我的学习" },
];

const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "概览" },
  { href: "/admin/students", label: "学生" },
  { href: "/admin/courses", label: "课程" },
];

export function AppShell({
  profile,
  children,
}: {
  profile: SessionProfile;
  children: React.ReactNode;
}) {
  const isAdmin = profile.role === "admin";

  return (
    <div className="flex min-h-screen flex-col">
      <NavigationProgress />
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6">
          <Link href={isAdmin ? "/admin" : "/courses"} className="flex items-center gap-2.5">
            <Image
              src="/float.png"
              alt=""
              aria-hidden
              width={32}
              height={34}
              priority
              className="h-8 w-auto object-contain dark:invert"
            />
            <span className="flex flex-col leading-none">
              <span className="font-serif text-base font-semibold tracking-tight">LearnOS</span>
              <span className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                {isAdmin ? "Admin Console" : "Learning Platform"}
              </span>
            </span>
          </Link>

          <div className="ml-2 hidden sm:block">
            <NavLinks items={isAdmin ? ADMIN_NAV : STUDENT_NAV} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-right text-xs leading-tight text-muted-foreground md:block">
              <span className="block font-medium text-foreground">{profile.displayName}</span>
              <span>{isAdmin ? "管理员" : "学生"}</span>
            </span>
            <ThemeToggle />
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                退出
              </Button>
            </form>
          </div>
        </div>
        <div className="border-t border-border px-4 py-2 sm:hidden">
          <NavLinks items={isAdmin ? ADMIN_NAV : STUDENT_NAV} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          LearnOS · 课程内容由管理员发布
        </div>
      </footer>
    </div>
  );
}
