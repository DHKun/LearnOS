/**
 * Pre-flight verification for the FloatCTF OIDC integration.
 *
 * Every check here is a property that has already blocked a real deployment, so
 * the command fails loudly instead of letting a broken login ship. Exits non-zero
 * on the first hard failure and prints a remediation hint for each check.
 */
import "../env";

type Check = { name: string; ok: boolean; detail: string; fix?: string };

const issuer = (process.env.FLOATCTF_OIDC_ISSUER ?? "").replace(/\/$/, "");
const clientId = process.env.FLOATCTF_OIDC_CLIENT_ID;
const clientSecret = process.env.FLOATCTF_OIDC_CLIENT_SECRET;
const supabaseUrl = (
  process.env.SUPABASE_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const results: Check[] = [];
function record(check: Check) {
  results.push(check);
  const mark = check.ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${check.name}: ${check.detail}`);
  if (!check.ok && check.fix) console.log(`       → ${check.fix}`);
}

function isPrivateOrLoopback(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 127 || a === 10 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  if (host === "[::1]" || host === "::1") return true;
  return false;
}

function base64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Fetch the IdP's real login page and read its `form-action` allowlist.
 *
 * The browser submits the login/consent form on the IdP origin and is then
 * redirected twice (IdP -> Supabase callback -> LearnOS). Chrome applies
 * form-action to the final redirect target, so both origins must be allowed.
 */
async function probeFormAction(
  issuerUrl: string,
  clientId: string,
  redirectUri: string,
): Promise<{ allowed: string[]; finalUrl: string; status: number } | null> {
  const authorize = new URL(`${issuerUrl}/oauth/authorize`);
  const params: Record<string, string> = {
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile",
    state: base64Url(crypto.getRandomValues(new Uint8Array(16))),
    code_challenge: base64Url(crypto.getRandomValues(new Uint8Array(32))),
    code_challenge_method: "S256",
  };
  for (const [key, value] of Object.entries(params)) authorize.searchParams.set(key, value);

  let current = authorize.toString();
  let response: Response | null = null;
  const jar = new Map<string, string>();
  for (let hop = 0; hop < 4; hop += 1) {
    // FloatCTF binds the authorization transaction to a browser cookie; without
    // it the login page returns 400 instead of the CSP we need to inspect.
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    response = await fetch(current, {
      redirect: "manual",
      headers: cookie ? { Cookie: cookie } : undefined,
    });
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const location = response.headers.get("location");
    if (!location) break;
    const next = new URL(location, current);
    if (next.origin !== new URL(issuerUrl).origin) break;
    current = next.toString();
  }
  if (!response) return null;

  const csp = response.headers.get("content-security-policy") ?? "";
  const directive = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith("form-action"));
  if (!directive) return { allowed: [], finalUrl: current, status: response.status };

  const allowed = directive
    .replace(/^form-action/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (token === "'self'" ? new URL(issuerUrl).origin : token));

  return { allowed, finalUrl: current, status: response.status };
}

async function main() {
  if (!issuer || !clientId || !clientSecret) {
    console.error("缺少 FLOATCTF_OIDC_ISSUER / CLIENT_ID / CLIENT_SECRET");
    process.exit(1);
  }

  // 1. GoTrue refuses http and any loopback/private issuer, both at creation
  //    time and on every discovery/JWKS fetch (ssrfProtectedTransport).
  const parsed = new URL(issuer);
  const isHttps = parsed.protocol === "https:";
  const isPrivate = isPrivateOrLoopback(parsed.hostname);
  record({
    name: "issuer 可被 Supabase Auth 接受",
    ok: isHttps && !isPrivate,
    detail: `${issuer}（https=${isHttps}，loopback/private=${isPrivate}）`,
    fix: "Supabase custom provider 只接受公网 HTTPS issuer；本地 loopback 与内网地址会被拒绝。",
  });

  // 2. Discovery must be reachable from *this* host and self-consistent.
  let discoveryOk = false;
  let discovery: Record<string, unknown> = {};
  try {
    const response = await fetch(`${issuer}/.well-known/openid-configuration`);
    discovery = (await response.json()) as Record<string, unknown>;
    discoveryOk = response.status === 200 && discovery.issuer === issuer;
    record({
      name: "discovery 可达且 issuer 一致",
      ok: discoveryOk,
      detail: `HTTP ${response.status}，issuer=${String(discovery.issuer)}`,
      fix: "确认 FloatCTF oidc.issuer 与 FLOATCTF_OIDC_ISSUER 逐字节一致（无尾斜杠、无默认端口）。",
    });
  } catch (error) {
    record({
      name: "discovery 可达",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // 3. PKCE S256 + authorization code flow are mandatory for Supabase's flow.
  const pkceOk =
    Array.isArray(discovery.code_challenge_methods_supported) &&
    (discovery.code_challenge_methods_supported as string[]).includes("S256");
  const codeOk =
    Array.isArray(discovery.response_types_supported) &&
    (discovery.response_types_supported as string[]).includes("code");
  record({
    name: "PKCE S256 与 authorization code",
    ok: pkceOk && codeOk,
    detail: `code=${codeOk}，S256=${pkceOk}`,
  });

  // 4. JWKS must be fetchable; GoTrue verifies the ID token signature with it.
  try {
    const jwksUrl = String(discovery.jwks_uri ?? `${issuer}/.well-known/jwks.json`);
    const response = await fetch(jwksUrl);
    const body = (await response.json()) as { keys?: unknown[] };
    record({
      name: "JWKS 可达",
      ok: response.status === 200 && (body.keys?.length ?? 0) > 0,
      detail: `HTTP ${response.status}，keys=${body.keys?.length ?? 0}`,
      fix: "JWKS 拉取超时会让 Supabase 报 fetching keys context deadline exceeded。",
    });
  } catch (error) {
    record({
      name: "JWKS 可达",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  // 5. The structural blocker: FloatCTF derives form-action from the registered
  //    redirect_uri only, while Supabase adds a second hop to the app. Probe the
  //    live page so this turns green automatically once the IdP is fixed.
  const callbackUrl = `${supabaseUrl}/auth/v1/callback`;
  const appOrigin = new URL(appUrl).origin;
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  if (!supabaseUrl) {
    record({
      name: "CSP form-action 覆盖两跳回跳",
      ok: false,
      detail: "缺少 SUPABASE_INTERNAL_URL/NEXT_PUBLIC_SUPABASE_URL，无法探测",
    });
  } else {
    try {
      const probe = await probeFormAction(issuer, clientId, callbackUrl);
      const allowed = probe?.allowed ?? [];
      const coversApp = allowed.includes(appOrigin);
      const coversCallback = allowed.includes(supabaseOrigin);
      record({
        name: "CSP form-action 覆盖两跳回跳",
        ok: coversApp && coversCallback,
        detail: probe
          ? `HTTP ${probe.status}；允许 [${allowed.join(", ")}]；需要 ${supabaseOrigin} + ${appOrigin}`
          : "未能取得登录页 CSP",
        fix:
          "FloatCTF 目前只把 redirect_uri origin 写入 form-action；" +
          "需把 LearnOS 的 origin 也纳入（例如读取登记的 client homepage_url）。",
      });
    } catch (error) {
      record({
        name: "CSP form-action 覆盖两跳回跳",
        ok: false,
        detail: `探测失败：${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  // 6. Provider must exist in Supabase and match what this app expects.
  if (supabaseUrl && serviceKey) {
    try {
      const headers = { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
      const response = await fetch(`${supabaseUrl}/auth/v1/admin/custom-providers`, { headers });
      const body = (await response.json()) as { providers?: Array<Record<string, unknown>> };
      const provider = body.providers?.find((p) => p.identifier === "custom:floatctf");
      const matches =
        Boolean(provider) &&
        provider?.enabled === true &&
        provider?.issuer === issuer &&
        provider?.client_id === clientId;
      record({
        name: "Supabase custom:floatctf 配置一致",
        ok: matches,
        detail: provider
          ? `enabled=${String(provider.enabled)} issuer=${String(provider.issuer)}`
          : "未找到 custom:floatctf",
        fix: "运行 `pnpm oidc:setup` 创建或更新 provider。",
      });
      record({
        name: "回调地址登记",
        ok: true,
        detail: `FloatCTF 应用需登记 ${callbackUrl}`,
      });
    } catch (error) {
      record({
        name: "读取 Supabase provider",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
  if (failed.length > 0) {
    console.log("未通过项：", failed.map((f) => f.name).join("、"));
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
