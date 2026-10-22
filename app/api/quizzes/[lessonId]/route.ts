import { requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getQuizForStudent } from "@/lib/services/quizzes";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    const student = await requireApiStudent();
    const { lessonId } = await context.params;
    const quiz = await getQuizForStudent(student.id, lessonId);
    return ok(quiz);
  } catch (error) {
    return errorResponse(error);
  }
}
