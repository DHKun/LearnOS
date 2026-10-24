import { ApiError } from "@/lib/api/errors";
import { getSessionProfile, type Role, type SessionProfile } from "@/lib/auth/session";

/** Authenticate an API request from the Better Auth cookie session. */
export async function requireUser(): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) throw new ApiError("UNAUTHENTICATED");
  if (profile.disabledAt) throw new ApiError("ACCOUNT_DISABLED");
  return profile;
}

export async function requireApiStudent(): Promise<SessionProfile> {
  const profile = await requireUser();
  if (profile.role !== "student") throw new ApiError("FORBIDDEN");
  return profile;
}

export async function requireApiAdmin(): Promise<SessionProfile> {
  const profile = await requireUser();
  if (profile.role !== "admin") throw new ApiError("FORBIDDEN");
  return profile;
}

function allowedOrigins(request: Request): Set<string> {
  const origins = new Set<string>();
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) origins.add(configured.replace(/\/$/, ""));

  let requestUrl: URL | null = null;
  try {
    requestUrl = new URL(request.url);
    origins.add(requestUrl.origin);
  } catch {
    // ignore malformed request URLs
  }

  const host = request.headers.get("host");
  if (host) {
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwarded || requestUrl?.protocol.replace(":", "") || "http";
    origins.add(`${protocol}://${host}`);
  }

  return origins;
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new ApiError("CSRF_ORIGIN_REJECTED");
  if (!allowedOrigins(request).has(origin.replace(/\/$/, ""))) {
    throw new ApiError("CSRF_ORIGIN_REJECTED");
  }
}

export function assertMutationRequest(request: Request): void {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") assertSameOrigin(request);
}

export type { Role };
