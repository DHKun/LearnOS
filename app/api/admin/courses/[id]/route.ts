import { ApiError } from "@/lib/api/errors";
import { assertMutationRequest, requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { adminPatchCourseSchema } from "@/lib/schemas/api";
import { updateCourse } from "@/lib/services/admin";
import { getAdminCourseDetail } from "@/lib/services/courses";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await context.params;
    const detail = await getAdminCourseDetail(id);
    if (!detail) throw new ApiError("COURSE_NOT_FOUND");
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
    const body = adminPatchCourseSchema.parse(await readJson(request));
    await updateCourse(id, body);
    return ok({ ok: true, id });
  } catch (error) {
    return errorResponse(error);
  }
}
