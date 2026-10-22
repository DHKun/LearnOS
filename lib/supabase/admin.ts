import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client with the secret (service role) key. It bypasses
 * RLS, so every caller MUST first authorise the acting user and resource.
 */
let cachedClient: SupabaseClient | null = null;

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient is server-only");
  }

  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase server credentials are not configured");
  }

  cachedClient = createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  return cachedClient;
}
