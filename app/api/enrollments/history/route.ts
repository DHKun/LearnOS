import { requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getEnrollmentHistory } from "@/lib/services/courses";

export async function GET() {
  try {
    const student = await requireApiStudent();
    const items = await getEnrollmentHistory(student.id);
    return ok({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
