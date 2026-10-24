import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { authCookieName, supabaseServerUrl } from "@/lib/supabase/config";

/**
 * Cookie-bound Supabase client. Uses the publishable key and is therefore
 * subject to RLS. Never import the service role key here.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseServerUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        name: authCookieName(),
        path: "/",
        sameSite: "lax",
        // The browser client (manual identity linking, sign-out) must read this
        // cookie; @supabase/ssr only supports JS-readable auth cookies.
        httpOnly: false,
        secure: (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component: middleware refreshes the session.
          }
        },
      },
    },
  );
}
