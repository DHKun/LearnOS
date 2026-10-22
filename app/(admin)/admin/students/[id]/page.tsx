import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StudentDetailView } from "@/components/admin/student-detail";
import { requireAdmin } from "@/lib/auth/session";
import { getStudentDetail } from "@/lib/services/admin";

export const metadata: Metadata = { title: "学生详情" };

export default async function AdminStudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const detail = await getStudentDetail(id);
  if (!detail) notFound();
  return <StudentDetailView initial={detail} />;
}
