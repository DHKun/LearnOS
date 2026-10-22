import { createAdminClient } from "@/lib/supabase/admin";
import type { PointsData } from "@/lib/types";

const TOTAL_LIMIT = 1000;

export async function getPoints(studentId: string): Promise<PointsData> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("point_events")
    .select("id,delta,reason,created_at")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(TOTAL_LIMIT);

  if (error) throw error;

  const items = (data ?? []).map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at,
  }));

  return {
    total: items.reduce((sum, item) => sum + item.delta, 0),
    items,
  };
}

export async function getTotalPoints(studentId: string): Promise<number> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("point_events")
    .select("delta")
    .eq("student_id", studentId);

  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + row.delta, 0);
}
