import { requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getCurrentEnrollment } from "@/lib/services/courses";

export async function GET() {
  try {
    const student = await requireApiStudent();
    const current = await getCurrentEnrollment(student.id);
    if (!current) return ok(null);
    return ok({
      enrollment: current.enrollment,
      course: current.course,
      lessons: current.lessons,
      lessonProgress: current.lessonProgress,
      courseProgress: current.courseProgress,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
