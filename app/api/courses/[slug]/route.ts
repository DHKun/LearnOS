import { ApiError } from "@/lib/api/errors";
import { requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getCourseDetailBySlug } from "@/lib/services/courses";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const student = await requireApiStudent();
    const { slug } = await context.params;
    const detail = await getCourseDetailBySlug(slug, student.id);
    if (!detail) throw new ApiError("COURSE_NOT_FOUND");
    return ok(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
