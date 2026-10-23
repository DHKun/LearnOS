import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { blockSubmitSchema } from "@/lib/schemas/api";
import { submitBlock } from "@/lib/services/blocks";

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const body = blockSubmitSchema.parse(await readJson(request));
    return ok(await submitBlock(student.id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
