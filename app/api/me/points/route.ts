import { requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getPoints } from "@/lib/services/points";

export async function GET() {
  try {
    const student = await requireApiStudent();
    const points = await getPoints(student.id);
    return ok(points);
  } catch (error) {
    return errorResponse(error);
  }
}
