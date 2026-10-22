import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok, readJson } from "@/lib/api/http";
import { submissionSchema } from "@/lib/schemas/api";
import { submitInteraction } from "@/lib/services/learning";

export async function POST(request: Request) {
  try {
    assertMutationRequest(request);
    const student = await requireApiStudent();
    const body = submissionSchema.parse(await readJson(request));
    const result = await submitInteraction(student.id, body);
    return ok(result);
  } catch (error) {
    return errorResponse(error);
  }
}
