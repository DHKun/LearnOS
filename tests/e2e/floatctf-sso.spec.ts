import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import {
  createTestStudent,
  deleteTestStudent,
  login,
  logout,
  serviceClient,
} from "./helpers";

/**
 * Real-browser acceptance for the FloatCTF single sign-on path.
 *
 * Requires a live external IdP, so the suite is skipped unless all of the
 * following are set. Run `pnpm oidc:verify` first: it fails fast on the
 * structural blockers (issuer policy, CSP two-hop) instead of producing
 * confusing browser errors.
 *
 *   E2E_FLOATCTF_SSO=1
 *   E2E_FLOATCTF_USERNAME / E2E_FLOATCTF_PASSWORD   # an IdP test account
 *   FLOATCTF_OIDC_ENABLED=true                      # app-side entry enabled
 */
const enabled =
  process.env.E2E_FLOATCTF_SSO === "1" &&
  process.env.FLOATCTF_OIDC_ENABLED === "true" &&
  Boolean(process.env.E2E_FLOATCTF_USERNAME) &&
  Boolean(process.env.E2E_FLOATCTF_PASSWORD);

test.describe.configure({ mode: "serial" });

// Free HTTPS tunnels used for local acceptance show an interstitial to browsers;
// this header is only set when the live-IdP suite is explicitly enabled.
test.use({
  extraHTTPHeaders: enabled ? { "X-Pinggy-No-Screen": "1" } : {},
});

const skipReason =
  "需要真实 FloatCTF 环境：设置 E2E_FLOATCTF_SSO=1、E2E_FLOATCTF_USERNAME/PASSWORD 并启用 FLOATCTF_OIDC_ENABLED";

/** Complete the IdP login/consent pages if the IdP renders them itself. */
async function completeIdpPages(page: Page) {
  for (let step = 0; step < 3; step += 1) {
    const url = page.url();
    if (url.includes("/oauth/login")) {
      await page.locator('input[name="username"]').fill(process.env.E2E_FLOATCTF_USERNAME!);
      await page.locator('input[name="password"]').fill(process.env.E2E_FLOATCTF_PASSWORD!);
      await page.getByRole("button", { name: "登录", exact: true }).click();
      // Wait for the IdP to actually leave the login page; a bare load-state
      // wait can resolve before navigation and cause a duplicate submission.
      await page
        .waitForURL((url) => !url.pathname.includes("/oauth/login"), { timeout: 30_000 })
        .catch(() => undefined);
      continue;
    }
    if (url.includes("/oauth/consent")) {
      await page.getByRole("button", { name: "允许" }).click();
      await page
        .waitForURL((url) => !url.pathname.includes("/oauth/consent"), { timeout: 30_000 })
        .catch(() => undefined);
      continue;
    }
    return;
  }
}

async function signInWithFloatctf(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "使用 FloatCTF 登录" }).click();
  await page.waitForURL(
    (url) => url.pathname.startsWith("/auth/callback") || !url.hostname.includes("localhost"),
    { timeout: 60_000 },
  );
  await completeIdpPages(page);
  await page.waitForURL(/\/(courses|learn|admin)|reason=/, { timeout: 60_000 });
}

async function currentUserId(page: Page): Promise<string> {
  await page.goto("/account/connections");
  const text = await page.locator("dd.font-mono").first().innerText();
  return text.trim();
}

async function findFloatctfUserId(): Promise<string | null> {
  const db = serviceClient();
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = data?.users.find(
    (candidate) =>
      candidate.app_metadata?.provider === "custom:floatctf" ||
      candidate.identities?.some((identity) => identity.provider === "custom:floatctf"),
  );
  return user?.id ?? null;
}

test.describe("FloatCTF 单一登录", () => {
  test.skip(!enabled, skipReason);

  test("首次登录创建 student 账号并进入课程", async ({ page }) => {
    await signInWithFloatctf(page);
    await expect(page).toHaveURL(/\/courses/);

    const userId = await currentUserId(page);
    const db = serviceClient();
    const { data: profile } = await db
      .from("profiles")
      .select("role, display_name, disabled_at")
      .eq("user_id", userId)
      .single();
    expect(profile?.role).toBe("student");
    expect(profile?.disabled_at).toBeNull();
    expect(profile?.display_name).toBeTruthy();
  });

  test("重复登录复用同一 Supabase 用户与学习记录", async ({ page }) => {
    await signInWithFloatctf(page);
    const first = await currentUserId(page);
    await logout(page);
    await signInWithFloatctf(page);
    expect(await currentUserId(page)).toBe(first);

    const db = serviceClient();
    const { data: profiles } = await db.from("profiles").select("user_id").eq("user_id", first);
    expect(profiles).toHaveLength(1);
  });

  test("已有账号手动绑定后保留原用户 ID", async ({ page }) => {
    const student = await createTestStudent("sso-link");
    try {
      // One IdP test account can only be linked to one Supabase user. Clear any
      // earlier SSO user from the preceding scenarios so this test exercises the
      // link path rather than the "already linked" rejection.
      const db = serviceClient();
      const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const candidate of users?.users ?? []) {
        const isFloatctf =
          candidate.app_metadata?.provider === "custom:floatctf" ||
          candidate.identities?.some((identity) => identity.provider === "custom:floatctf");
        if (isFloatctf && candidate.id !== student.id) {
          await db.auth.admin.deleteUser(candidate.id);
        }
      }
      await login(page, student.email, student.password);
      await page.goto("/account/connections");
      await page.getByRole("button", { name: "绑定 FloatCTF 账号" }).click();
      // linkIdentity sends the browser to the IdP first; the Supabase callback
      // only happens after the user approves there.
      await page.waitForURL((url) => !url.pathname.startsWith("/account/connections"), {
        timeout: 60_000,
      });
      await completeIdpPages(page);
      await page.waitForURL(/\/account\/connections/, { timeout: 60_000 });
      await expect(page.getByText("FloatCTF 已绑定").first()).toBeVisible();
      expect(await currentUserId(page)).toBe(student.id);
    } finally {
      await deleteTestStudent(student.id);
    }
  });

  test("停用账号无法进入受保护页面", async ({ page }) => {
    const student = await createTestStudent("sso-disabled");
    try {
      await login(page, student.email, student.password);
      const db = serviceClient();
      await db
        .from("profiles")
        .update({ disabled_at: new Date().toISOString() })
        .eq("user_id", student.id);
      await page.goto("/courses");
      await expect(page).toHaveURL(/\/login/);
    } finally {
      await deleteTestStudent(student.id);
    }
  });

  test("退出后重新登录进入同一账号", async ({ page }) => {
    await signInWithFloatctf(page);
    const before = await currentUserId(page);
    await logout(page);
    await expect(page).toHaveURL(/\/login/);
    await signInWithFloatctf(page);
    expect(await currentUserId(page)).toBe(before);
  });

  test("未授权用户不会被自动合并到已有邮箱账号", async ({ page }) => {
    const marker = `sso-merge-${randomUUID().slice(0, 8)}`;
    const student = await createTestStudent(marker);
    try {
      await signInWithFloatctf(page);
      const idpUserId = await currentUserId(page);
      // The IdP account must never land on the password account by email.
      expect(idpUserId).not.toBe(student.id);
      const mergeCandidate = await findFloatctfUserId();
      expect(mergeCandidate).not.toBe(student.id);
    } finally {
      await deleteTestStudent(student.id);
    }
  });
});

/**
 * The failure redirect does not need a live IdP, so it must always run: a broken
 * callback error path would silently strand users on an OAuth error page.
 */
test.describe("FloatCTF 登录失败回跳", () => {
  test("IdP 拒绝授权时回到登录页并给出提示", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&intent=login");
    await expect(page).toHaveURL(/\/login\?reason=oauth_failed/);
    await expect(page.getByRole("alert").first()).toBeVisible();
  });

  test("缺少授权码时不建立会话", async ({ page }) => {
    await page.goto("/auth/callback?code=&intent=login");
    await expect(page).toHaveURL(/\/login\?reason=oauth_failed/);
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/login/);
  });

  test("未登录时绑定失败回登录页并说明原因", async ({ page }) => {
    await page.goto("/auth/callback?error=access_denied&intent=link");
    // The connections page is guarded, so a signed-out user must not be sent there.
    await expect(page).toHaveURL(/\/login\?reason=link_failed/);
    await expect(page.getByText("FloatCTF 绑定未完成")).toBeVisible();
  });

  test("已登录时绑定失败回到连接页", async ({ page }) => {
    const student = await createTestStudent("sso-link-fail");
    try {
      await login(page, student.email, student.password);
      await page.goto("/auth/callback?error=access_denied&intent=link");
      await expect(page).toHaveURL(/\/account\/connections\?error=link_failed/);
    } finally {
      await deleteTestStudent(student.id);
    }
  });

  test("拒绝跨站 next 参数", async ({ page }) => {
    await page.goto("/auth/callback?error=denied&next=//evil.example/gift");
    await expect(page).toHaveURL(/\/login\?reason=oauth_failed/);
  });
});
