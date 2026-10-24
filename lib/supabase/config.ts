/**
 * Server-side Supabase URL.
 *
 * Browsers must use `NEXT_PUBLIC_SUPABASE_URL`. Inside Docker the container's
 * loopback is not the host, so Compose sets `SUPABASE_INTERNAL_URL` to the
 * host gateway for server rendering, middleware and four service-role calls.
 * Local scripts outside Docker fall back to the public URL.
 */
export function supabaseServerUrl(): string {
  const url = process.env.SUPABASE_INTERNAL_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Supabase URL is not configured");
  return url;
}

/**
 * Stable auth cookie name.
 *
 * The server may reach Supabase through SUPABASE_INTERNAL_URL (a container
 * gateway) while the browser uses NEXT_PUBLIC_SUPABASE_URL. @supabase/ssr
 * derives the cookie name from the URL host, so those two clients would look
 * for different cookies and lose the PKCE verifier. Pin the name to the public
 * URL's project segment on both sides.
 */
export function authCookieName(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  try {
    const project = new URL(url).hostname.split(".")[0];
    return project ? `sb-${project}-auth-token` : undefined;
  } catch {
    return undefined;
  }
}
