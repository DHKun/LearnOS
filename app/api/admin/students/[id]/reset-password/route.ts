import { assertMutationRequest, requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { requestPasswordReset } from "@/lib/services/admin";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertMutationRequest(request);
    await requireApiAdmin();
    const { id } = await context.params;
    const result = await requestPasswordReset(id);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
