import { ok } from "@/lib/api/http";

export const dynamic = "force-dynamic";

/**
 * Liveness endpoint used by the updater after `docker compose up`.
 * The build version is baked into the image; a mismatch means the old
 * container is still serving traffic and the health check keeps waiting.
 */
export async function GET() {
  return ok({
    status: "ok",
    version: process.env.LEARNOS_BUILD_VERSION ?? "dev",
    builtAt: process.env.LEARNOS_BUILD_TIME ?? null,
    now: new Date().toISOString(),
  });
}
