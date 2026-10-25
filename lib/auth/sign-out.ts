import { auth } from "@/lib/auth/better";

export type SignOutResult = { ok: true } | { ok: false };

/**
 * End the LearnOS (Better Auth) session — and only that session.
 *
 * The FloatCTF SSO session lives on FloatCTF's origin; LearnOS can neither see
 * nor clear it, and must not pretend to. FloatCTF publishes no end-session
 * endpoint, so Better Auth does not attempt any provider logout either.
 *
 * Better Auth's sign-out logs and swallows a failed session delete and still
 * reports success, so success is decided by re-reading the session with the
 * original cookie: if it still resolves, the user is still signed in.
 */
export async function signOutLearnOS(requestHeaders: Headers): Promise<SignOutResult> {
  try {
    const result = await auth.api.signOut({ headers: requestHeaders });
    if (!result?.success) return { ok: false };
    const remaining = await auth.api.getSession({
      headers: requestHeaders,
      query: { disableCookieCache: true },
    });
    return remaining ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}
