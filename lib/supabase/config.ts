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
