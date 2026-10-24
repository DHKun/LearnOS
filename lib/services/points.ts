import { sql } from "drizzle-orm";

import { mapPgError, rows, rpc } from "@/lib/db/query";
import type { PointsData } from "@/lib/types";

const DETAIL_LIMIT = 1000;

export async function getPoints(studentId: string): Promise<PointsData> {
  try {
    const [itemsResult, totalResult] = await Promise.all([
      rows<{ id: string; delta: number; reason: string; created_at: string }>(sql`
        select id, delta, reason, created_at
        from public.point_events
        where student_id = ${studentId}::uuid
        order by created_at desc
        limit ${DETAIL_LIMIT}
      `),
      rpc<number>("student_points_total", { p_student: studentId }),
    ]);

    return {
      total: Number(totalResult ?? 0),
      items: itemsResult.map((row) => ({
        id: row.id,
        delta: row.delta,
        reason: row.reason,
        createdAt: row.created_at,
      })),
    };
  } catch (error) {
    mapPgError(error);
  }
}

export async function getTotalPoints(studentId: string): Promise<number> {
  try {
    return Number(
      (await rpc<number>("student_points_total", { p_student: studentId })) ?? 0,
    );
  } catch (error) {
    mapPgError(error);
  }
}
