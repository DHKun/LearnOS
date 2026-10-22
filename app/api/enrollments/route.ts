import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { joinCourseSchema } from "@/lib/schemas/api";
import { joinCourse } from "@/lib/services/enrollments";

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const body = joinCourseSchema.parse(await readJson(request));
    const enrollment = await joinCourse(student.id, body.courseId);
    return ok(enrollment);
  } catch (error) {
    return errorResponse(error);
  }
}
