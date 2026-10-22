import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { abandonCourse } from "@/lib/services/enrollments";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const { id } = await context.params;
    const enrollment = await abandonCourse(student.id, id);
    return ok(enrollment);
  } catch (error) {
    return errorResponse(error);
  }
}
