import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Route } from "lucide-react";

import { PathMap, pathPercent } from "@/components/learning/path-map";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireStudent } from "@/lib/auth/session";
import { loadPaths } from "@/lib/content/paths";
import { getStudentPath } from "@/lib/services/paths";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: loadPaths().find((path) => path.slug === slug)?.title ?? "学习路线" };
}

export default async function PathPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const student = await requireStudent();
  const path = await getStudentPath(student.id, slug);
  if (!path) notFound();
  const upcoming = path.steps.length - path.available;

  return (
    <div className="space-y-10">
      <div>
        <Link href="/paths" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> 全部路线
        </Link>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-end">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
              <Route className="size-3.5" aria-hidden /> 学习路线 · {path.level} · {path.steps.length} 门课
            </p>
            <h1 className="mt-2 font-serif text-3xl font-semibold">{path.title}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{path.description}</p>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
            <Progress value={pathPercent(path)} label={`${path.title}进度`} showValue={false} />
            <p data-testid="path-progress" className="text-xs text-muted-foreground">
              已完成 {path.completed} / {path.steps.length} 门{upcoming ? `（其中 ${upcoming} 门即将上线）` : ""}
            </p>
            {path.next?.courseId && (
              <Button asChild size="sm" className="w-full">
                <Link href={`/courses/${path.next.slug}`}>
                  {path.next.state === "active" ? "继续" : path.next.state === "abandoned" ? "恢复" : "开始"}：{path.next.title}
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
      <PathMap path={path} />
    </div>
  );
}
