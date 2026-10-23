import "../env";

type Provider = {
  identifier: string;
  provider_type: string;
  issuer?: string;
  enabled: boolean;
  scopes: string[];
};

const identifier = "custom:floatctf";
const issuer = process.env.FLOATCTF_OIDC_ISSUER?.replace(/\/$/, "");
const clientId = process.env.FLOATCTF_OIDC_CLIENT_ID;
const clientSecret = process.env.FLOATCTF_OIDC_CLIENT_SECRET;
const supabaseUrl = (
  process.env.SUPABASE_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  ""
).replace(/\/$/, "");
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const checkOnly = process.argv.includes("--check");

if (!issuer || !clientId || !clientSecret) {
  console.error(
    "缺少 FLOATCTF_OIDC_ISSUER / FLOATCTF_OIDC_CLIENT_ID / FLOATCTF_OIDC_CLIENT_SECRET",
  );
  process.exit(1);
}
if (!supabaseUrl || !serviceKey) {
  console.error("缺少 SUPABASE_INTERNAL_URL/NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function json<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: T;
  try {
    body = JSON.parse(text) as T;
  } catch {
    throw new Error(`${url} 返回非 JSON（${response.status}）：${text.slice(0, 300)}`);
  }
  return { status: response.status, body };
}

async function main() {
  const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
  const discovery = await json<{
    issuer?: string;
    authorization_endpoint?: string;
    token_endpoint?: string;
    userinfo_endpoint?: string;
    jwks_uri?: string;
    response_types_supported?: string[];
    code_challenge_methods_supported?: string[];
    token_endpoint_auth_methods_supported?: string[];
    scopes_supported?: string[];
  }>(discoveryUrl);

  if (discovery.status !== 200) throw new Error(`Discovery 失败：HTTP ${discovery.status}`);
  const d = discovery.body;
  if (d.issuer !== issuer) {
    throw new Error(`Discovery issuer 不匹配：期望 ${issuer}，实际 ${d.issuer ?? "(缺失)"}`);
  }
  if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) {
    throw new Error("Discovery 缺少 authorization/token/jwks 端点");
  }
  if (!(d.response_types_supported ?? []).includes("code")) {
    throw new Error("Provider 未宣告 authorization code flow");
  }
  if (!(d.code_challenge_methods_supported ?? []).includes("S256")) {
    throw new Error("Provider 未宣告 PKCE S256");
  }

  console.log("Discovery OK", {
    issuer: d.issuer,
    authorization_endpoint: d.authorization_endpoint,
    token_endpoint: d.token_endpoint,
    jwks_uri: d.jwks_uri,
    userinfo_endpoint: d.userinfo_endpoint ?? null,
    auth_methods: d.token_endpoint_auth_methods_supported ?? [],
    scopes: d.scopes_supported ?? [],
  });

  const callbackUrl = `${supabaseUrl}/auth/v1/callback`;
  console.log("FloatCTF 应用需要登记的 Redirect URI:", callbackUrl);
  if (checkOnly) return;

  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey!,
    "Content-Type": "application/json",
  };
  const list = await json<{ providers?: Provider[] }>(
    `${supabaseUrl}/auth/v1/admin/custom-providers`,
    { headers },
  );
  if (list.status !== 200) {
    throw new Error(`读取 Custom Providers 失败：HTTP ${list.status}`);
  }

  const body = {
    provider_type: "oidc",
    identifier,
    name: "FloatCTF",
    client_id: clientId,
    client_secret: clientSecret,
    issuer,
    scopes: ["openid", "profile"],
    pkce_enabled: true,
    email_optional: true,
    enabled: true,
  };
  const existing = list.body.providers?.find((provider) => provider.identifier === identifier);

  if (existing) {
    const updated = await json<{ identifier?: string }>(
      `${supabaseUrl}/auth/v1/admin/custom-providers/${identifier}`,
      { method: "PUT", headers, body: JSON.stringify(body) },
    );
    if (updated.status !== 200) {
      throw new Error(`更新 ${identifier} 失败：HTTP ${updated.status} ${JSON.stringify(updated.body)}`);
    }
    console.log("Updated", updated.body);
  } else {
    const created = await json<{ identifier?: string }>(
      `${supabaseUrl}/auth/v1/admin/custom-providers`,
      { method: "POST", headers, body: JSON.stringify(body) },
    );
    if (created.status !== 200 && created.status !== 201) {
      throw new Error(`创建 ${identifier} 失败：HTTP ${created.status} ${JSON.stringify(created.body)}`);
    }
    console.log("Created", created.body);
  }

  console.log(
    "完成。Supabase Auth 仅通过 ID Token 建立用户；FloatCTF 的 email/profile 在 UserInfo，不会被本接入自动合并到已有账号。",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
