import { requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getAdminOverview } from "@/lib/services/admin";

export async function GET() {
  try {
    await requireApiAdmin();
    const overview = await getAdminOverview();
    return ok(overview);
  } catch (error) {
    return errorResponse(error);
  }
}
