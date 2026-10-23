import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verify the cookie session's JWT and return the user id.
 *
 * With asymmetric signing keys (the project default) `getClaims()` verifies
 * the signature locally against the cached JWKS, avoiding a GoTrue round trip
 * on every page render and every API interaction. Symmetric projects fall back
 * to `getUser()` inside the SDK, so behaviour stays correct.
 */
export async function getVerifiedUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const sub = (data.claims as { sub?: unknown }).sub;
  return typeof sub === "string" && sub.length > 0 ? sub : null;
}
