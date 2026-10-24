import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth/better";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { safeNextPath } from "@/lib/auth/floatctf";

const LOGIN_ERROR = "/login?reason=oauth_failed";
const LINK_ERROR = "/login?reason=link_failed";
const LINK_ERROR_WHILE_SIGNED_IN = "/account/connections?error=link_failed";
const LINK_OK = "/account/connections?linked=1";

function redirect(request: Request, path: string): NextResponse {
  const host = request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ? "https" : "http");
  const base = host ? `${proto}://${host}` : request.url;
  return NextResponse.redirect(new URL(path, base));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const intent = url.searchParams.get("intent");
  const next = safeNextPath(url.searchParams.get("next"));

  // Better Auth has already completed the OIDC code exchange before sending the
  // browser here; this route only maps the resulting session to a profile.
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  if (error || !session?.user) {
    if (intent === "link") {
      return redirect(request, session ? LINK_ERROR_WHILE_SIGNED_IN : LINK_ERROR);
    }
    return redirect(request, LOGIN_ERROR);
  }

  if (intent === "link") return redirect(request, LINK_OK);

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, session.user.id))
    .limit(1);

  if (!profile) return redirect(request, LOGIN_ERROR);
  if (profile.disabledAt) return redirect(request, "/login?reason=disabled");

  return redirect(
    request,
    next ?? (profile.role === "admin" ? "/admin" : "/courses"),
  );
}
