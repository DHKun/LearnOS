import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { completeLessonSchema } from "@/lib/schemas/api";
import { completeLesson } from "@/lib/services/enrollments";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const { id } = await context.params;
    const body = completeLessonSchema.parse(await readJson(request));
    const result = await completeLesson(student.id, body.enrollmentId, id);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
