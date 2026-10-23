import { requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { scanDeploymentCourses } from "@/lib/services/deployments";

export async function GET() {
  try {
    await requireApiAdmin();
    const scan = await scanDeploymentCourses();
    return ok(scan);
  } catch (error) {
    return errorResponse(error);
  }
}
