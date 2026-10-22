import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api/errors";
import type { Role, SessionProfile } from "@/lib/auth/session";

/** Authenticate an API request from the Supabase cookie session. */
export async function requireUser(): Promise<SessionProfile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new ApiError("UNAUTHENTICATED");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id,email,display_name,role,disabled_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile) throw new ApiError("UNAUTHENTICATED");
  if (profile.disabled_at) throw new ApiError("ACCOUNT_DISABLED");

  return {
    id: profile.user_id,
    email: profile.email,
    displayName: profile.display_name,
    role: (profile.role === "admin" ? "admin" : "student") as Role,
    disabledAt: profile.disabled_at,
  };
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

  // Next may report a bind address (0.0.0.0) in request.url while the browser
  // used a LAN hostname or localhost. Trust the Host header for same-origin
  // comparison so both access names keep working.
  const host = request.headers.get("host");
  if (host) {
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const protocol = forwarded || requestUrl?.protocol.replace(":", "") || "http";
    origins.add(`${protocol}://${host}`);
  }

  return origins;
}

/**
 * CSRF / cross-origin protection for cookie-authenticated mutations.
 * Browsers always send Origin on fetch POST/PUT/PATCH; server-to-server
 * callers must set it explicitly.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) throw new ApiError("CSRF_ORIGIN_REJECTED");
  if (!allowedOrigins(request).has(origin.replace(/\/$/, ""))) {
    throw new ApiError("CSRF_ORIGIN_REJECTED");
  }
}

/** Guard for every mutating Route Handler. */
export function assertMutationRequest(request: Request): void {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    assertSameOrigin(request);
  }
}
