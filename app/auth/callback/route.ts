import { NextResponse } from "next/server";

import {
  getOrCreateFloatctfProfile,
  OidcProvisionError,
  safeNextPath,
} from "@/lib/auth/floatctf";
import { createClient } from "@/lib/supabase/server";

const LOGIN_ERROR = "/login?reason=oauth_failed";
const LINK_ERROR = "/account/connections?error=link_failed";

function redirect(request: Request, path: string): NextResponse {
  return NextResponse.redirect(new URL(path, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const intent = url.searchParams.get("intent");
  const next = safeNextPath(url.searchParams.get("next"));

  if (error || !code) {
    return redirect(request, intent === "link" ? LINK_ERROR : LOGIN_ERROR);
  }

  const supabase = await createClient();
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !data.user) {
    return redirect(request, intent === "link" ? LINK_ERROR : LOGIN_ERROR);
  }

  if (intent === "link") {
    return redirect(request, "/account/connections?linked=1");
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
