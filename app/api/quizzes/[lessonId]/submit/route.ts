import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { quizSubmitSchema } from "@/lib/schemas/api";
import { submitQuiz } from "@/lib/services/quizzes";

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const { lessonId } = await context.params;
    const body = quizSubmitSchema.parse(await readJson(request));
    const result = await submitQuiz(
      student.id,
      lessonId,
      body.attemptId,
      body.answers,
    );
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
