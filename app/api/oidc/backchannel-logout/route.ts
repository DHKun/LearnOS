import { NextResponse } from "next/server";

import {
  LogoutTokenError,
  claimJti,
  revokeSessionsFor,
  verifyLogoutToken,
} from "@/lib/auth/floatctf-logout";
import { isFloatctfLoginEnabled } from "@/lib/auth/floatctf";

// OpenID Connect Back-Channel Logout 1.0 §2.5–2.8：FloatCTF 服务端直接 POST，不依赖浏览器 Cookie。
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

function reject(description: string) {
  return NextResponse.json(
    { error: "invalid_request", error_description: description },
    { status: 400, headers: NO_STORE },
  );
}

export async function POST(request: Request) {
  if (!isFloatctfLoginEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return reject("content type must be application/x-www-form-urlencoded");
  }
  const body = await request.text();
  if (body.length > 16 * 1024) return reject("request too large");
  const params = new URLSearchParams(body);
  const tokens = params.getAll("logout_token");
  if (tokens.length !== 1) return reject("exactly one logout_token is required");

  let verified;
  try {
    verified = await verifyLogoutToken(tokens[0]);
  } catch (error) {
    if (error instanceof LogoutTokenError) {
      console.warn(`[floatctf backchannel] rejected logout token: ${error.message}`);
      return reject(error.message);
    }
    console.error("[floatctf backchannel] verification failed", error);
    return reject("logout token could not be verified");
  }

  if (!(await claimJti(verified))) {
    console.warn(`[floatctf backchannel] replayed jti from ${verified.issuer}`);
    return reject("logout token already used");
  }
  try {
    const revoked = await revokeSessionsFor(verified);
    console.info(
      `[floatctf backchannel] iss=${verified.issuer} sid=${verified.sid ?? "-"} revoked=${revoked}`,
    );
  } catch (error) {
    // 撤销失败必须让 OP 知道（§2.8：400），由 FloatCTF 记录为未能确认，绝不报告成功。
    console.error("[floatctf backchannel] revocation failed", error);
    return reject("logout failed");
  }
  // 没有匹配的会话（例如用户已在 LearnOS 退出）也属于成功：该 sid 在本应用已无会话。
  return new NextResponse(null, { status: 200, headers: NO_STORE });
}
