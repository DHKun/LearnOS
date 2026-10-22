import { requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { listAdminCourses } from "@/lib/services/courses";

export async function GET() {
  try {
    await requireApiAdmin();
    const items = await listAdminCourses();
    return ok({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
