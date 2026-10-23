import { assertMutationRequest, requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { deploymentActionSchema } from "@/lib/schemas/api";
import {
  createDeploymentJob,
  createRollbackJob,
  getDeploymentOverview,
} from "@/lib/services/deployments";

export async function GET() {
  try {
    await requireApiAdmin();
    const overview = await getDeploymentOverview();
    return ok(overview);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    const admin = await requireApiAdmin();
    const body = deploymentActionSchema.parse(await readJson(request));
    const job =
      body.action === "deploy"
        ? await createDeploymentJob(admin.id)
        : await createRollbackJob(admin.id, body.targetJobId);
    return ok(job, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
