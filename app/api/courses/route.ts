import { requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { listStudentCourses } from "@/lib/services/courses";

export async function GET() {
  try {
    const student = await requireApiStudent();
    const items = await listStudentCourses(student.id);
    return ok({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
