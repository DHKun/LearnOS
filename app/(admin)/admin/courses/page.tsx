import type { Metadata } from "next";

import { CourseScanSection } from "@/components/admin/course-scan-section";
import { CoursesManager } from "@/components/admin/courses-manager";
import { PageHeader } from "@/components/page";
import { requireAdmin } from "@/lib/auth/session";
import { listAdminCourses } from "@/lib/services/courses";
import { scanDeploymentCourses } from "@/lib/services/deployments";

export const metadata: Metadata = { title: "课程管理" };

export default async function AdminCoursesPage() {
  await requireAdmin();
  const [courses, scan] = await Promise.all([listAdminCourses(), scanDeploymentCourses()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin Console"
        title="课程管理"
        description="复制本地课程目录后先扫描更新，再到部署页面编译并部署。扫描只读取文件，不会触发构建。"
      />
      <CourseScanSection initialScan={scan} />
      <CoursesManager initial={courses} />
    </div>
  );
}
