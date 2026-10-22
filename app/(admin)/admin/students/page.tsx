import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StudentsExplorer } from "@/components/admin/students-explorer";
import { PageHeader } from "@/components/page";
import { requireAdmin } from "@/lib/auth/session";
import { listStudents } from "@/lib/services/admin";

export const metadata: Metadata = { title: "学生管理" };

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  if (params.student) redirect(`/admin/students/${params.student}`);
  const initial = await listStudents({ page: 1, pageSize: 20 });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Console"
        title="学生管理"
        description="按姓名/邮箱搜索，查看当前课程、章节、进度、最近在线与实际交互时间。点击行打开完整学习记录。"
      />
      <StudentsExplorer initial={initial} />
    </div>
  );
}
