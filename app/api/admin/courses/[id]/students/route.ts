import { requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { courseStudentsQuerySchema } from "@/lib/schemas/api";
import { listCourseStudents } from "@/lib/services/admin";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireApiAdmin();
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const query = courseStudentsQuerySchema.parse({
      status: params.get("status") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });
    const result = await listCourseStudents(id, query);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
