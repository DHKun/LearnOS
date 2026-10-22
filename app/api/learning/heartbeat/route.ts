import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { heartbeatSchema } from "@/lib/schemas/api";
import { recordHeartbeat } from "@/lib/services/learning";

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const body = heartbeatSchema.parse(await readJson(request));
    const result = await recordHeartbeat(
      student.id,
      body.enrollmentId,
      body.lessonId ?? null,
      body.visible,
      body.focused,
    );
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
