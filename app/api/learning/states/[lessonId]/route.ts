import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { stateSaveSchema } from "@/lib/schemas/api";
import { getState, saveState } from "@/lib/services/learning";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    const student = await requireApiStudent();
    const { lessonId } = await context.params;
    const state = await getState(student.id, lessonId);
    return ok(state);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const { lessonId } = await context.params;
    const body = stateSaveSchema.parse(await readJson(request));
    const result = await saveState(
      student.id,
      body.enrollmentId,
      lessonId,
      body.state,
      body.expectedVersion,
    );
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
