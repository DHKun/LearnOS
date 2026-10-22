import { assertMutationRequest, requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { adminPatchStudentSchema } from "@/lib/schemas/api";
import { getStudentDetail, updateStudent } from "@/lib/services/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await context.params;
    const detail = await getStudentDetail(id);
    return ok(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMutationRequest(request);
    await requireApiAdmin();
    const { id } = await context.params;
    const body = adminPatchStudentSchema.parse(await readJson(request));
    await updateStudent(id, body);
    return ok({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
