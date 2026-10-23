import { NextResponse } from "next/server";

import {
  getOrCreateFloatctfProfile,
  OidcProvisionError,
  safeNextPath,
} from "@/lib/auth/floatctf";
import { createClient } from "@/lib/supabase/server";

const LOGIN_ERROR = "/login?reason=oauth_failed";
const LINK_ERROR = "/login?reason=link_failed";
const LINK_ERROR_WHILE_SIGNED_IN = "/account/connections?error=link_failed";
const LINK_OK = "/account/connections?linked=1";

/**
 * Redirect on the origin the browser actually used.
 *
 * Behind a reverse proxy or a DNS alias the request URL host can differ from the
 * app's configured public origin (127.0.0.1 vs localhost, for example). Following
 * the configured origin there would move the user to another host, where the
 * Supabase session cookie set on the request host is not sent.
 */
function redirect(request: Request, path: string): NextResponse {
  // Next normalises request.url to the configured origin, so the Host header is
  // the only reliable record of the origin the browser is actually on.
  const host = request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ? "https" : "http");
  const base = host ? `${proto}://${host}` : request.url;
  const target = new URL(path, base);
  // `new URL("//evil.example", base)` resolves to another origin, so pin the
  // result back to the request origin before handing it to the browser.
  const origin = new URL(base);
  if (target.origin !== origin.origin) {
    return NextResponse.redirect(new URL("/login?reason=oauth_failed", base));
  }
  return NextResponse.redirect(target);
}

/**
 * A link attempt always starts from a signed-in LearnOS session. If that session
 * is gone (expired, signed out in another tab), sending the user to the guarded
 * connections page would bounce them to /login with no explanation, so route the
 * error where they can actually see it.
 */
function linkErrorDestination(signedIn: boolean): string {
  return signedIn ? LINK_ERROR_WHILE_SIGNED_IN : LINK_ERROR;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const intent = url.searchParams.get("intent");
  const next = safeNextPath(url.searchParams.get("next"));

  const supabase = await createClient();

  if (error || !code) {
    if (intent !== "link") return redirect(request, LOGIN_ERROR);
    const { data: existing } = await supabase.auth.getUser();
    return redirect(request, linkErrorDestination(Boolean(existing.user)));
  }

  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data.user) {
    if (intent !== "link") return redirect(request, LOGIN_ERROR);
    const { data: existing } = await supabase.auth.getUser();
    return redirect(request, linkErrorDestination(Boolean(existing.user)));
  }

  if (intent === "link") {
    return redirect(request, LINK_OK);
  }

  try {
    const profile = await getOrCreateFloatctfProfile(data.user);
    if (profile.disabledAt) {
      await supabase.auth.signOut();
      return redirect(request, "/login?reason=disabled");
    }
    const destination = next ?? (profile.role === "admin" ? "/admin" : "/courses");
    return redirect(request, destination);
  } catch (caught) {
    await supabase.auth.signOut();
    if (caught instanceof OidcProvisionError && caught.code === "SIGNUP_DISABLED") {
      return redirect(request, "/login?reason=signup_closed");
    }
    return redirect(request, LOGIN_ERROR);
  }
}
