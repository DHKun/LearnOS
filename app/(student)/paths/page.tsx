import type { Metadata } from "next";

import { EmptyState, PageHeader } from "@/components/page";
import { PathSummaryCard } from "@/components/learning/path-map";
import { requireStudent } from "@/lib/auth/session";
import { getStudentPaths } from "@/lib/services/paths";

export const metadata: Metadata = { title: "学习路线" };

export default async function PathsPage() {
  const student = await requireStudent();
  const { paths } = await getStudentPaths(student.id);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="学习路线" title="按路线学习" description="每条路线把几门课按推荐顺序串起来。按顺序学效果最好，也可以跳着学。" />
      {paths.length === 0 ? (
        <EmptyState title="还没有学习路线" description="管理员发布路线后会显示在这里。" />
      ) : (
        <div className="space-y-4">
          {paths.map((path) => (
            <PathSummaryCard key={path.slug} path={path} />
          ))}
        </div>
      )}
    </div>
  );
}
