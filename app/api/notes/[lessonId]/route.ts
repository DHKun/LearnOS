import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { noteSchema } from "@/lib/schemas/api";
import { getNote, saveNote } from "@/lib/services/notes";

export async function GET(
  _request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  try {
    const student = await requireApiStudent();
    const { lessonId } = await context.params;
    const note = await getNote(student.id, lessonId);
    return ok(note);
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
    const body = noteSchema.parse(await readJson(request));
    const note = await saveNote(student.id, lessonId, body.content);
    return ok(note);
  } catch (error) {
    return errorResponse(error);
  }
}
