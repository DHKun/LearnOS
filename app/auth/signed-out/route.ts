import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { LOGOUT_STATE_COOKIE } from "@/lib/auth/floatctf-logout";

/**
 * FloatCTF RP-Initiated Logout 完成后的回跳点（`post_logout_redirect_uri`）。
 *
 * LearnOS 会话在跳转到 FloatCTF 之前已经结束；这里只核对 state（防止被第三方伪造的回跳误导提示文案），
 * 清除一次性 Cookie，再回到登录页。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const store = await cookies();
  const expected = store.get(LOGOUT_STATE_COOKIE)?.value;
  const matched = Boolean(expected) && url.searchParams.get("state") === expected;
  store.delete({ name: LOGOUT_STATE_COOKIE, path: "/auth/signed-out" });
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ? "https" : "http");
  const base = host ? `${proto}://${host}` : request.url;
  return NextResponse.redirect(
    new URL(matched ? "/login?reason=global_signed_out" : "/login?reason=signed_out", base),
  );
}
