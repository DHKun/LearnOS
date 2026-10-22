import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { eventSchema } from "@/lib/schemas/api";
import { recordEvent } from "@/lib/services/learning";

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const body = eventSchema.parse(await readJson(request));
    const result = await recordEvent(student.id, body);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
