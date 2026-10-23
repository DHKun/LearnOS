import { requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { uuidSchema } from "@/lib/schemas/api";
import { getDeploymentJob } from "@/lib/services/deployments";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await context.params;
    return ok(await getDeploymentJob(uuidSchema.parse(id)));
  } catch (error) {
    return errorResponse(error);
  }
}
