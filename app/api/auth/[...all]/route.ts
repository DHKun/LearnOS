import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/better";
import { withLoginContext } from "@/lib/auth/floatctf-logout";

const handlers = toNextJsHandler(auth);

// 每个认证请求一个独立上下文：OAuth 回调内验证过的 FloatCTF ID Token 只传给本次请求创建的会话。
export const GET = (request: Request) => withLoginContext(() => handlers.GET(request));
export const POST = (request: Request) => withLoginContext(() => handlers.POST(request));
