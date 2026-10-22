import { assertMutationRequest, requireApiStudent } from "@/lib/api/guard";
import { errorResponse, ok } from "@/lib/api/http";
import { getTotalPoints } from "@/lib/services/points";

export async function GET(request: Request) {
  try {
    assertMutationRequest(request);
    const profile = await requireApiStudent();
    const totalPoints = await getTotalPoints(profile.id);
    return ok({
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      role: profile.role,
      totalPoints,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
