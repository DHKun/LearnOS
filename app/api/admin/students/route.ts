import { assertMutationRequest, requireApiAdmin } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { adminCreateStudentSchema, studentListQuerySchema } from "@/lib/schemas/api";
import { createStudent, listStudents } from "@/lib/services/admin";

export async function GET(request: Request) {
  try {
    await requireApiAdmin();
    const params = new URL(request.url).searchParams;
    const query = studentListQuerySchema.parse({
      q: params.get("q") ?? undefined,
      online: params.get("online") ?? undefined,
      courseId: params.get("courseId") ?? undefined,
      page: params.get("page") ?? undefined,
      pageSize: params.get("pageSize") ?? undefined,
    });
    const result = await listStudents(query);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    await requireApiAdmin();
    const body = adminCreateStudentSchema.parse(await readJson(request));
    const result = await createStudent(body);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
