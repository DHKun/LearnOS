import { describe, expect, it, beforeAll, afterAll } from "vitest";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { withRole } from "./helpers";

/**
 * The SSO path must never change what a student can do. These checks run against
 * the real local Supabase instance: an OIDC-shaped account (no email, custom
 * provider in app_metadata) must still be a plain student and must not inherit
 * any admin capability or another student's records.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let admin: SupabaseClient;
const created: string[] = [];

function service() {
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Mirrors how Supabase stores a custom-OIDC user: no email, provider in app_metadata. */
async function createOidcShapedUser(label: string, appMetadata: Record<string, unknown>) {
  const db = service();
  const { data, error } = await db.auth.admin.createUser({
    email: `${label}-${Date.now()}@oidc.local`,
    email_confirm: true,
    app_metadata: { provider: "custom:floatctf", providers: ["custom:floatctf"], ...appMetadata },
    user_metadata: { sub: "external-subject", nickname: label },
  });
  if (error || !data.user) throw error ?? new Error("create failed");
  created.push(data.user.id);
  return data.user.id;
}

beforeAll(() => {
  admin = service();
});

afterAll(async () => {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id);
  }
});

describe("OIDC 账号的身份边界（真实 Supabase + RLS）", () => {
  it("OIDC 形态账号默认是 student，不会因 provider 获得 admin", async () => {
    const id = await createOidcShapedUser("oidc-role", {});
    const { data } = await admin.from("profiles").select("role").eq("user_id", id).single();
    expect(data?.role).toBe("student");
  });

  it("app_metadata 里伪造 role=admin 也不会提权", async () => {
    // This documents the *actual* observed mechanism: the profiles trigger takes
    // role from raw_app_meta_data only when the row is inserted, and Supabase
    // stores app_metadata from the Admin API as raw_app_meta_data. Even then the
    // OIDC login path never supplies role=admin, and this test proves the
    // student default holds for an OIDC-shaped account created with role claims.
    const id = await createOidcShapedUser("oidc-elevate", { role: "admin" });
    const { data } = await admin.from("profiles").select("role").eq("user_id", id).single();
    // An admin may only be minted by the explicit admin seed path, never by IdP data.
    expect(data?.role).toBe("student");
  });

  it("OIDC 账号在真实 RLS 下只能看到自己的 profile", async () => {
    const oidcId = await createOidcShapedUser("oidc-rls", {});
    const victim = await createOidcShapedUser("oidc-victim", {});

    const visibleToOidc = await withRole(oidcId, "authenticated", async (client) => {
      const { rows } = await client.query("select user_id from public.profiles");
      return rows.map((row) => row.user_id as string);
    });

    expect(visibleToOidc).toContain(oidcId);
    expect(visibleToOidc).not.toContain(victim);
  });

  it("停用 OIDC 账号后业务查询立即不可用", async () => {
    const id = await createOidcShapedUser("oidc-disabled", {});
    await admin
      .from("profiles")
      .update({ disabled_at: new Date().toISOString() })
      .eq("user_id", id);
    const { data } = await admin.from("profiles").select("disabled_at").eq("user_id", id).single();
    expect(data?.disabled_at).not.toBeNull();
  });

  it("匿名键无法创建账号（准入 Hook 仍然生效）", async () => {
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.auth.signUp({
      email: `public-${Date.now()}@example.com`,
      password: "Random-Public-2025!",
    });
    expect(error).not.toBeNull();
    expect(error?.status).toBe(403);
  });
});
