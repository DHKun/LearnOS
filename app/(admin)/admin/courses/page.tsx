import type { Metadata } from "next";

import { CoursesManager } from "@/components/admin/courses-manager";
import { PageHeader } from "@/components/page";
import { requireAdmin } from "@/lib/auth/session";
import { listAdminCourses } from "@/lib/services/courses";

export const metadata: Metadata = { title: "课程管理" };

export default async function AdminCoursesPage() {
  await requireAdmin();
  const courses = await listAdminCourses();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Console"
        title="课程管理"
        description="课程内容是仓库中的可信代码。这里管理发布状态与元信息，并查看每门课的学员情况。"
      />
      <CoursesManager initial={courses} />
    </div>
  );
}
