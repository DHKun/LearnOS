import { createAdminClient } from "@/lib/supabase/admin";
import type { PointsData } from "@/lib/types";

const DETAIL_LIMIT = 1000;

export async function getPoints(studentId: string): Promise<PointsData> {
  const db = createAdminClient();
  const [itemsResult, totalResult] = await Promise.all([
    db
      .from("point_events")
      .select("id,delta,reason,created_at")
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .limit(DETAIL_LIMIT),
    db.rpc("student_points_total", { p_student: studentId }),
  ]);

  if (itemsResult.error) throw itemsResult.error;
  if (totalResult.error) throw totalResult.error;

  const items = (itemsResult.data ?? []).map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at,
  }));

  return {
    total: Number(totalResult.data ?? 0),
    items,
  };
}

export async function getTotalPoints(studentId: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("student_points_total", { p_student: studentId });
  if (error) throw error;
  return Number(data ?? 0);
}
