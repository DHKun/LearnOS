import { generateKeyPairSync, randomUUID } from "node:crypto";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { SignJWT, importPKCS8 } from "jose";
import { Pool } from "pg";

import { queryOne } from "./helpers";

/**
 * Real-browser acceptance for the unified FloatCTF identity (FloatCTF main site +
 * FloatCTF OP + LearnOS RP), both apps served over HTTPS with a certificate the
 * browser and Node verify (no ignoreHTTPSErrors).
 *
 * Covers the browser side of PLAN A01–A15 and A19/A20: main-site cookie session
 * ↔ OIDC chooser in both directions, local sign-outs that keep the other app,
 * a failing main-site sign-out, two accounts in one browser, cross-tab switching,
 * prompt/max_age compatibility for an RP that sends no prompt, logo/avatar
 * fallback, Back-Channel Logout that revokes exactly the right LearnOS session,
 * forged Logout Tokens, an unreachable receiver that is retried, RP-Initiated
 * Logout from LearnOS, per-account and whole-browser sign-out, admin/Bearer
 * separation and cookie CSRF/SSRF guards.
 *
 * The OP must run with the unified switches on:
 *   [oidc] multi_account = true, unified_web_session = true, backchannel_logout = true,
 *   backchannel_trusted_hosts = ["<learnos host:port>", "<PARTITION host:port>"]
 * and LearnOS' client registered with post_logout_redirect_uris = [<LearnOS>/auth/signed-out]
 * and backchannel_logout_uri = <LearnOS>/api/oidc/backchannel-logout.
 *
 * Required environment (see docs/oidc-floatctf.md「统一身份 E2E」):
 *   E2E_FLOATCTF_UNIFIED=1
 *   FLOATCTF_OIDC_ISSUER / FLOATCTF_MAIN_URL       OP issuer and the FloatCTF main site (same origin)
 *   FLOATCTF_OIDC_CLIENT_ID                        LearnOS' client at the OP
 *   FLOATCTF_E2E_DB_URL                            the OP's isolated database (assertions + test setup only)
 *   E2E_FLOATCTF_USER_A / E2E_FLOATCTF_USER_B / E2E_FLOATCTF_PASSWORD
 *   E2E_FLOATCTF_LEGACY_CLIENT_ID                  public client, redirect https://legacy-rp.test/callback
 *   E2E_FLOATCTF_PARTITION_HOST                    trusted host:port with nothing listening (A14)
 */
const enabled =
  process.env.E2E_FLOATCTF_UNIFIED === "1" &&
  Boolean(process.env.FLOATCTF_OIDC_ISSUER) &&
  Boolean(process.env.FLOATCTF_MAIN_URL) &&
  Boolean(process.env.FLOATCTF_OIDC_CLIENT_ID) &&
  Boolean(process.env.FLOATCTF_E2E_DB_URL) &&
  Boolean(process.env.E2E_FLOATCTF_USER_A) &&
  Boolean(process.env.E2E_FLOATCTF_USER_B) &&
  Boolean(process.env.E2E_FLOATCTF_PASSWORD) &&
  Boolean(process.env.E2E_FLOATCTF_LEGACY_CLIENT_ID) &&
  Boolean(process.env.E2E_FLOATCTF_PARTITION_HOST);

const OP = (process.env.FLOATCTF_OIDC_ISSUER ?? "").replace(/\/$/, "");
const MAIN = (process.env.FLOATCTF_MAIN_URL ?? "").replace(/\/$/, "");
const LEARN = (process.env.E2E_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
const CLIENT_ID = process.env.FLOATCTF_OIDC_CLIENT_ID ?? "";
const USER_A = process.env.E2E_FLOATCTF_USER_A ?? "";
const USER_B = process.env.E2E_FLOATCTF_USER_B ?? "";
const PASSWORD = process.env.E2E_FLOATCTF_PASSWORD ?? "";
const LEGACY_CLIENT = process.env.E2E_FLOATCTF_LEGACY_CLIENT_ID ?? "";
const LEGACY_REDIRECT = "https://legacy-rp.test/callback";
const PARTITION_HOST = process.env.E2E_FLOATCTF_PARTITION_HOST ?? "";
const BACKCHANNEL_URI = `${LEARN}/api/oidc/backchannel-logout`;
// RFC 7636 Appendix B
const VERIFIER_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
// 1×1 PNG（真实图片，用于头像上传）
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const op = enabled ? new Pool({ connectionString: process.env.FLOATCTF_E2E_DB_URL, max: 2 }) : null;

async function opQuery<T>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await op!.query(text, values)).rows as T[];
}

type FloatUser = { id: string; nickname: string };

async function floatctfUser(username: string): Promise<FloatUser> {
  const [row] = await opQuery<FloatUser>("select id::text, nickname from public.users where username = $1", [
    username,
  ]);
  if (!row) throw new Error(`FloatCTF user ${username} missing`);
  return row;
}

/** OP 身份会话（未撤销、未过期），按 sid 识别。 */
async function liveSids(userId: string): Promise<string[]> {
  const rows = await opQuery<{ sid: string }>(
    `select sid from public.oidc_browser_sessions
      where user_id = $1 and revoked_at is null and expires_at > now() order by created_at`,
    [userId],
  );
  return rows.map((r) => r.sid);
}

async function sessionRow(sid: string) {
  const [row] = await opQuery<{ revoked_at: Date | null; revoked_reason: string | null }>(
    "select revoked_at, revoked_reason from public.oidc_browser_sessions where sid = $1",
    [sid],
  );
  return row;
}

/** OP 上最近一次签发给 LearnOS 的身份会话 sid（LearnOS 用它把自己的会话映射到 OP）。 */
async function learnosSessionSid(page: Page): Promise<string> {
  const response = await page.request.get("/api/auth/get-session");
  const body = (await response.json()) as { session?: { id: string } } | null;
  if (!body?.session) throw new Error("no LearnOS session");
  const row = await queryOne<{ sid: string }>(
    "select sid from public.floatctf_oidc_sessions where session_id = $1",
    [body.session.id],
  );
  if (!row) throw new Error("LearnOS session is not linked to a FloatCTF identity session");
  return row.sid;
}

async function learnosUserId(page: Page): Promise<string | null> {
  const response = await page.request.get(`${LEARN}/api/auth/get-session`);
  const body = (await response.json().catch(() => null)) as { user?: { id: string } } | null;
  return body?.user?.id ?? null;
}

async function learnosUserFor(floatctfSub: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    "select user_id from public.account where provider_id = 'floatctf' and account_id = $1",
    [floatctfSub],
  );
  return row?.user_id ?? null;
}

function navigations(page: Page): string[] {
  const urls: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) urls.push(frame.url());
  });
  return urls;
}

// ---------------------------------------------------------------- FloatCTF main site

type WebStatus = {
  mode: string;
  authenticated: boolean;
  user: { id: string; username: string } | null;
  csrf_token: string | null;
  accounts: { id: string; username: string; active: boolean }[];
};

/** 主站登录态：只能来自服务端（HttpOnly Cookie 由浏览器自动携带）。 */
async function mainStatus(page: Page): Promise<WebStatus> {
  const response = await page.request.get(`${MAIN}/api/users/web-session`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { data: WebStatus }).data;
}

async function mainLogin(page: Page, username: string) {
  await expect(page.getByLabel("Username")).toBeVisible();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/service/, { timeout: 30_000 });
}

function accountMenu(page: Page) {
  return page.getByRole("button", { name: /^账号菜单：/ });
}

async function expectMainAccount(page: Page, username: string) {
  await expect(accountMenu(page)).toHaveAccessibleName(new RegExp(`（@${username}）$`), { timeout: 15_000 });
}

async function openMenuItem(page: Page, name: string | RegExp) {
  await accountMenu(page).click();
  await page.getByRole("menuitem", typeof name === "string" ? { name, exact: true } : { name }).click();
}

// ---------------------------------------------------------------- LearnOS × OP

async function clickFloatctfLogin(page: Page) {
  await page.goto(`${LEARN}/login`);
  // Better Auth 对 /sign-in/* 限流且本套件保持限流开启：被限流时按 X-Retry-After 等待后重试。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/social"));
    await page.getByRole("button", { name: "使用 FloatCTF 登录" }).click();
    const result = await response;
    if (result.status() !== 429) break;
    const wait = Number(result.headers()["x-retry-after"] ?? "10");
    await page.waitForTimeout((Number.isFinite(wait) ? wait : 10) * 1000 + 500);
  }
  await page.waitForURL((url) => url.origin === OP, { timeout: 30_000 });
}

async function signOutOfLearnOS(page: Page) {
  await page.goto(`${LEARN}/courses`);
  await page.getByRole("button", { name: "退出 LearnOS" }).click();
  await page.waitForURL(/\/login\?reason=signed_out/);
}

function chooserAccounts(page: Page) {
  return page.getByRole("list", { name: "本浏览器中已登录的 FloatCTF 账号" }).getByRole("button");
}

async function chooseAccount(page: Page, username: string) {
  await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/select-account`));
  await chooserAccounts(page).filter({ hasText: `@${username}` }).click();
}

async function passwordLogin(page: Page, username: string) {
  await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/oauth/login"), { timeout: 30_000, waitUntil: "commit" });
}

async function allowConsentIfAsked(page: Page) {
  await page.waitForURL((url) => url.origin !== OP || url.pathname.startsWith("/oauth/consent"), {
    timeout: 30_000,
    waitUntil: "commit",
  });
  if (new URL(page.url()).pathname.startsWith("/oauth/consent")) {
    await page.getByRole("button", { name: "允许" }).click();
  }
  await page.waitForURL(/\/courses/, { timeout: 30_000 });
}

function legacyAuthorize(extra: Record<string, string> = {}) {
  return `${OP}/oauth/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: LEGACY_CLIENT,
    redirect_uri: LEGACY_REDIRECT,
    scope: "openid profile",
    state: `st-${randomUUID()}`,
    nonce: `n-${randomUUID()}`,
    code_challenge: VERIFIER_CHALLENGE,
    code_challenge_method: "S256",
    ...extra,
  })}`;
}

async function newContext(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: LEARN });
  // 旧 RP 的回调域名不存在：拦截后只读取查询参数。
  await context.route("https://legacy-rp.test/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "legacy rp callback" }),
  );
  return { context, page: await context.newPage() };
}

async function setLearnosBackchannel(uri: string) {
  await opQuery("update public.oidc_clients set backchannel_logout_uri = $2 where client_id = $1", [
    CLIENT_ID,
    uri,
  ]);
}

test.describe.configure({ mode: "serial" });

test.describe("FloatCTF 统一身份（主站 × OP × LearnOS，真实浏览器）", () => {
  test.skip(!enabled, "需要统一身份开关已开启的 FloatCTF OP、主站与隔离数据库：见文件头注释");

  const contexts: BrowserContext[] = [];
  let alice: FloatUser;
  let bob: FloatUser;
  // A：主站密码登录的浏览器；B：先从 LearnOS 登录的浏览器；C、D：其他设备
  let a: Page;
  let b: Page;
  let learnosAlice: string;
  let learnosBob: string;

  async function open(browser: Browser) {
    const { context, page } = await newContext(browser);
    contexts.push(context);
    return page;
  }

  test.beforeAll(async () => {
    alice = await floatctfUser(USER_A);
    bob = await floatctfUser(USER_B);
    // 干净起点（仅隔离测试库）：撤销两人的 OP 会话与授权记录、删除 LearnOS 侧旧绑定，恢复 LearnOS 的退出通知地址。
    await opQuery(
      "update public.oidc_browser_sessions set revoked_at = now() where user_id = any($1::uuid[]) and revoked_at is null",
      [[alice.id, bob.id]],
    );
    await opQuery("delete from public.oidc_consents where user_id = any($1::uuid[])", [[alice.id, bob.id]]);
    await opQuery("update public.users set avatar = null where id = any($1::uuid[])", [[alice.id, bob.id]]);
    await setLearnosBackchannel(BACKCHANNEL_URI);
    for (const sub of [alice.id, bob.id]) {
      const userId = await learnosUserFor(sub);
      if (!userId) continue;
      await queryOne("delete from public.profiles where user_id = $1", [userId]);
      await queryOne('delete from public."user" where id = $1', [userId]);
    }
  });

  test.afterAll(async () => {
    await setLearnosBackchannel(BACKCHANNEL_URI).catch(() => undefined);
    for (const context of contexts) await context.close();
    await op?.end();
  });

  test("A01/U01 主站密码登录只下发 HttpOnly Cookie；LearnOS 选择同一账号，不再输入密码", async ({ browser }) => {
    a = await open(browser);
    await a.goto(`${MAIN}/`);
    await mainLogin(a, USER_A);
    await expectMainAccount(a, USER_A);

    // 主站不再把平台 JWT 写进 localStorage；认证 Cookie 是 HttpOnly + Secure + host-only。
    const stored = await a.evaluate(() => localStorage.getItem("auth-storage"));
    expect(JSON.parse(stored ?? "{}")?.state?.token ?? null).toBeNull();
    const cookies = (await a.context().cookies(MAIN)).filter((c) => c.name.startsWith("__Host-fctf"));
    expect(cookies.map((c) => c.name)).toContain("__Host-fctf_accounts");
    for (const c of cookies) {
      expect(c.httpOnly, c.name).toBe(true);
      expect(c.secure, c.name).toBe(true);
      expect(c.domain.startsWith("."), c.name).toBe(false);
      expect(c.path, c.name).toBe("/");
    }
    const status = await mainStatus(a);
    expect(status).toMatchObject({ mode: "cookie", authenticated: true, user: { username: USER_A } });

    const navs = navigations(a);
    await clickFloatctfLogin(a);
    await expect(a.getByRole("heading", { name: "选择 FloatCTF 账号" })).toBeVisible();
    await expect(chooserAccounts(a)).toHaveCount(1);
    await expect(a.locator('input[type="password"]')).toHaveCount(0);
    await chooseAccount(a, USER_A);
    await allowConsentIfAsked(a); // 第一次进入 LearnOS：授权一次
    expect(navs.some((u) => u.startsWith(`${OP}/oauth/login`))).toBe(false);

    learnosAlice = (await learnosUserFor(alice.id))!;
    expect(learnosAlice).toBeTruthy();
    expect(await learnosUserId(a)).toBe(learnosAlice);
    // LearnOS 会话绑定的正是主站登录建立的那个 OP 身份会话
    expect(await liveSids(alice.id)).toContain(await learnosSessionSid(a));
  });

  test("A03/U04 退出 LearnOS 只结束本地会话；FloatCTF 保持登录，再次登录先选账号且不重复授权", async () => {
    await signOutOfLearnOS(a);
    expect(await learnosUserId(a)).toBeNull();
    expect((await mainStatus(a)).authenticated).toBe(true);

    const navs = navigations(a);
    await clickFloatctfLogin(a);
    await chooseAccount(a, USER_A);
    await a.waitForURL(/\/courses/);
    expect(navs.some((u) => u.includes("/oauth/consent") || u.includes("/oauth/login"))).toBe(false);
    expect(await learnosUserId(a)).toBe(learnosAlice);
  });

  test("A02/U03 先在 LearnOS 经 FloatCTF 输入密码，再打开主站自动恢复同一账号", async ({ browser }) => {
    b = await open(browser);
    await clickFloatctfLogin(b);
    await passwordLogin(b, USER_A);
    await allowConsentIfAsked(b);
    expect(await learnosUserId(b)).toBe(learnosAlice);

    const navs = navigations(b);
    await b.goto(`${MAIN}/`);
    await b.waitForURL(/\/service/, { timeout: 30_000 });
    await expectMainAccount(b, USER_A);
    // 没有经过主站密码表单提交
    expect(navs.filter((u) => u.startsWith(MAIN)).every((u) => !u.includes("password"))).toBe(true);
    expect((await mainStatus(b)).user?.username).toBe(USER_A);
  });

  test("A06 主站退出请求失败：提示「退出未完成」，登录状态与 OP 会话都不变", async () => {
    const before = await liveSids(alice.id);
    await b.route("**/api/users/web-session/logout", (route) => route.abort("failed"));
    await openMenuItem(b, /退出当前账号/);
    const dialog = b.getByRole("dialog", { name: "退出未完成" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("当前登录状态没有改变");
    await dialog.getByRole("button", { name: "关闭" }).first().click();

    await b.unroute("**/api/users/web-session/logout");
    await b.route("**/api/users/web-session/logout", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"code":500,"message":"injected"}' }),
    );
    await openMenuItem(b, /退出当前账号/);
    await expect(b.getByRole("dialog", { name: "退出未完成" })).toBeVisible();
    await b.getByRole("dialog", { name: "退出未完成" }).getByRole("button", { name: "关闭" }).first().click();
    await b.unroute("**/api/users/web-session/logout");

    await expect(b).toHaveURL(/\/service/);
    expect((await mainStatus(b)).authenticated).toBe(true);
    expect(await liveSids(alice.id)).toEqual(before);
  });

  test("A04/U05/U12 主站普通退出：撤销 OP 与主站会话，LearnOS 会话保留；之后不会被静默恢复", async () => {
    const sidB = await learnosSessionSid(b);
    await openMenuItem(b, /退出当前账号/);
    await b.waitForURL(`${MAIN}/`);
    const status = await mainStatus(b);
    expect(status.authenticated).toBe(false);
    expect(status.accounts).toHaveLength(0);
    expect((await sessionRow(sidB)).revoked_at).not.toBeNull();
    // 浏览器 A 的同一用户会话不受影响
    expect(await liveSids(alice.id)).toContain(await learnosSessionSid(a));

    // LearnOS 已有会话默认保留
    await b.goto(`${LEARN}/courses`);
    await expect(b).toHaveURL(/\/courses/);
    expect(await learnosUserId(b)).toBe(learnosAlice);

    // 重新打开主站：停在登录页，不会自动恢复
    await b.goto(`${MAIN}/`);
    await b.waitForTimeout(1_000);
    await expect(b.getByLabel("Username")).toBeVisible();
    expect((await mainStatus(b)).authenticated).toBe(false);
  });

  test("A05 FloatCTF 已退出：LearnOS 再次 SSO 必须重新验证身份", async () => {
    await signOutOfLearnOS(b);
    await clickFloatctfLogin(b);
    await expect(b).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
    await passwordLogin(b, USER_A);
    await allowConsentIfAsked(b);
    expect(await learnosUserId(b)).toBe(learnosAlice);
  });

  test("A07/U06/U11 同一浏览器 A、B：选择页只列两个真实账号；B 单独授权；RP 选 B 不切换主站当前账号", async () => {
    // 主站添加账号 B，再切回 A
    await a.goto(`${MAIN}/service/top`);
    await openMenuItem(a, "添加账号");
    await a.waitForURL(/add=true/);
    await mainLogin(a, USER_B);
    await expectMainAccount(a, USER_B);
    await openMenuItem(a, alice.nickname);
    await expectMainAccount(a, USER_A);
    const status = await mainStatus(a);
    expect(status.accounts.map((x) => x.username).sort()).toEqual([USER_A, USER_B].sort());

    await signOutOfLearnOS(a);
    await clickFloatctfLogin(a);
    await expect(chooserAccounts(a)).toHaveCount(2);
    await chooseAccount(a, USER_B);
    // B 从未授权过 LearnOS：必须单独同意，不继承 A 的授权
    await expect(a).toHaveURL(new RegExp(`^${OP}/oauth/consent\\?txn=`));
    await expect(a.getByText(`@${USER_B}`)).toBeVisible();
    await allowConsentIfAsked(a);
    learnosBob = (await learnosUserFor(bob.id))!;
    expect(learnosBob).toBeTruthy();
    expect(learnosBob).not.toBe(learnosAlice);
    expect(await learnosUserId(a)).toBe(learnosBob);
    const consents = await opQuery<{ username: string }>(
      `select u.username from public.oidc_consents c join public.users u on u.id = c.user_id
         join public.oidc_clients k on k.id = c.oidc_client_id
        where k.client_id = $1 and c.user_id = any($2::uuid[]) and c.revoked_at is null`,
      [CLIENT_ID, [alice.id, bob.id]],
    );
    expect(consents.map((c) => c.username).sort()).toEqual([USER_A, USER_B].sort());

    // 主站当前账号仍是 A
    await a.goto(`${MAIN}/service/top`);
    await expectMainAccount(a, USER_A);
    expect((await mainStatus(a)).user?.username).toBe(USER_A);
  });

  test("A08 跨标签：一个标签切换账号，另一个标签同步到新账号", async () => {
    const other = await a.context().newPage();
    await other.goto(`${MAIN}/service/top`);
    await expectMainAccount(other, USER_A);
    await openMenuItem(a, bob.nickname);
    await expectMainAccount(a, USER_B);
    await expectMainAccount(other, USER_B);
    // 切回 A 供后续用例使用
    await openMenuItem(other, alice.nickname);
    await expectMainAccount(a, USER_A);
    await other.close();
  });

  test("A10/A11 不带 prompt 的旧 RP：多账号先选择；prompt=none 不弹页面；prompt=login、max_age=0 选中账号后仍要求重新认证", async () => {
    const page = await a.context().newPage();
    await page.goto(legacyAuthorize());
    await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/select-account`));
    await expect(chooserAccounts(page)).toHaveCount(2);

    // prompt=none：OP 直接 302 回 RP、不渲染任何页面（用同一浏览器 Cookie 发请求，读取 302 而不跟随跨站跳转）
    const state = `st-none-${randomUUID()}`;
    const silent = await page.request.get(legacyAuthorize({ prompt: "none", state }), { maxRedirects: 0 });
    expect(silent.status()).toBe(302);
    const cb = new URL(silent.headers()["location"]);
    expect(cb.origin + cb.pathname).toBe(LEGACY_REDIRECT);
    expect(cb.searchParams.get("error")).toBe("account_selection_required");
    expect(cb.searchParams.get("state")).toBe(state);
    expect(cb.searchParams.get("iss")).toBe(OP);

    for (const extra of [{ prompt: "login" }, { max_age: "0" }] as Record<string, string>[]) {
      // 多账号浏览器：先选账号，再对选中的账号要求重新输入密码（已有会话不能满足）
      await page.goto(legacyAuthorize(extra));
      await chooseAccount(page, USER_A);
      await expect(page, JSON.stringify(extra)).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
      await expect(page.locator('input[type="password"]')).toHaveCount(1);
    }
    await page.close();
  });

  test("A15 官方 Logo 与头像：float.png 可用；有效头像加载，失效头像回退首字母、不出现破图", async ({ browser }) => {
    const logo = await a.request.get(`${OP}/oauth/assets/float.png`);
    expect(logo.status()).toBe(200);
    expect(logo.headers()["content-type"]).toBe("image/png");

    // A 通过 CLI 兼容的 Bearer 接口上传真实头像；B 的头像指向不存在的文件
    const ctx = await browser.newContext();
    const token = (await (
      await ctx.request.post(`${MAIN}/api/users/session`, { data: { username: USER_A, password: PASSWORD } })
    ).json()) as { data: string };
    const upload = await ctx.request.patch(`${MAIN}/api/uploads/avatar`, {
      headers: { Authorization: `Bearer ${token.data}` },
      multipart: { image_file: { name: "a.png", mimeType: "image/png", buffer: PNG_1X1 } },
    });
    expect(upload.ok()).toBe(true);
    await ctx.close();
    await opQuery("update public.users set avatar = '/public/images/e2e-missing-avatar.png' where id = $1", [bob.id]);

    const page = await a.context().newPage();
    const bad: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/avatar") && r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    await page.goto(legacyAuthorize());
    await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/select-account`));
    const brand = page.locator("img[src$='float.png']").first();
    await expect(brand).toBeVisible();
    expect(await brand.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    const rowA = chooserAccounts(page).filter({ hasText: `@${USER_A}` });
    const rowB = chooserAccounts(page).filter({ hasText: `@${USER_B}` });
    await expect(rowA.locator("img")).toHaveCount(1);
    await expect.poll(() => rowA.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    // 失效头像：图片被隐藏（data-failed），只露出首字母；页面上没有任何可见的加载失败图片
    await expect(rowB.locator("img")).toBeHidden();
    await expect(rowB.locator("img")).toHaveAttribute("data-failed", "1");
    await expect(rowB.locator(".avatar > span")).toHaveText(bob.nickname.charAt(0).toUpperCase());
    await expect(rowB.locator(".avatar > span")).toBeVisible();
    const broken = await page.evaluate(() =>
      [...document.images]
        .filter((img) => img.complete && img.naturalWidth === 0 && img.checkVisibility())
        .map((img) => img.src),
    );
    expect(broken).toEqual([]);
    expect(bad.length).toBeGreaterThan(0); // 确实请求过失效头像并得到 404
    await page.close();
    await opQuery("update public.users set avatar = null where id = $1", [bob.id]);
  });

  test("A13/U08 主站「退出所有关联应用」：只撤销 A 这次登录绑定的 LearnOS 会话，B 与其他设备不受影响", async ({
    browser,
  }) => {
    // 浏览器 A 的 LearnOS 换回 A（绑定 A 在浏览器 A 的身份会话）
    await signOutOfLearnOS(a);
    await clickFloatctfLogin(a);
    await chooseAccount(a, USER_A);
    await a.waitForURL(/\/courses/);
    const sidA = await learnosSessionSid(a);

    // 另一设备 C：A 用密码登录 LearnOS；设备 D：B 登录 LearnOS
    const c = await open(browser);
    await clickFloatctfLogin(c);
    await passwordLogin(c, USER_A);
    await allowConsentIfAsked(c);
    const sidC = await learnosSessionSid(c);
    const d = await open(browser);
    await clickFloatctfLogin(d);
    await passwordLogin(d, USER_B);
    await allowConsentIfAsked(d);
    expect(sidC).not.toBe(sidA);

    await a.goto(`${MAIN}/service/top`);
    await expectMainAccount(a, USER_A);
    await openMenuItem(a, /退出所有关联应用/);
    const confirm = a.getByRole("alertdialog", { name: "退出 FloatCTF 及所有关联应用？" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "退出所有关联应用" }).click();
    const report = a.getByRole("dialog", { name: "已退出 FloatCTF 及关联应用" });
    await expect(report).toBeVisible({ timeout: 30_000 });
    await expect(report).toContainText("LearnOS");
    await expect(report).toContainText("已确认退出");

    // 精确作用范围
    expect((await sessionRow(sidA)).revoked_at).not.toBeNull();
    expect(await learnosUserId(a)).toBeNull();
    expect(await learnosUserId(c)).toBe(learnosAlice);
    expect(await learnosUserId(d)).toBe(learnosBob);
    expect((await sessionRow(sidC)).revoked_at).toBeNull();
    expect((await liveSids(bob.id)).length).toBeGreaterThanOrEqual(2); // 浏览器 A 中的 B + 设备 D
    const [delivery] = await opQuery<{ status: string; attempts: number }>(
      `select d.status, d.attempts from public.oidc_backchannel_deliveries d
         join public.oidc_clients k on k.id = d.oidc_client_id
        where k.client_id = $1 and d.sid = $2`,
      [CLIENT_ID, sidA],
    );
    expect(delivery).toMatchObject({ status: "delivered" });
    await report.getByRole("button", { name: "完成" }).click();
    await a.waitForURL(`${MAIN}/`);
    expect((await mainStatus(a)).user?.username ?? null).not.toBe(USER_A);
  });

  test("A12 伪造、错误签名、alg=none 的 Logout Token 都被 LearnOS 拒绝，不撤销任何会话", async ({ browser }) => {
    const c = contexts[contexts.length - 2].pages()[0];
    const d = contexts[contexts.length - 1].pages()[0];
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: OP,
      aud: CLIENT_ID,
      iat: now,
      exp: now + 120,
      jti: randomUUID(),
      sub: alice.id,
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
    };
    const forged = await new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", typ: "logout+jwt", kid: "e2e-key-1" })
      .sign(await importPKCS8(pem, "RS256"));
    const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const none = `${b64({ alg: "none", typ: "logout+jwt" })}.${b64(claims)}.`;
    const ctx = await browser.newContext();
    for (const token of ["not-a-jwt", forged, none]) {
      const response = await ctx.request.post(BACKCHANNEL_URI, { form: { logout_token: token } });
      expect(response.status(), token.slice(0, 20)).toBe(400);
    }
    await ctx.close();
    expect(await learnosUserId(c)).toBe(learnosAlice);
    expect(await learnosUserId(d)).toBe(learnosBob);
  });

  test("A14 投递失败（网络不可达）：如实提示未同步、记录待重试；恢复后自动重试并撤销 LearnOS 会话", async () => {
    const c = contexts[contexts.length - 2].pages()[0];
    const sidC = await learnosSessionSid(c);
    await setLearnosBackchannel(`https://${PARTITION_HOST}/api/oidc/backchannel-logout`);
    try {
      // 设备 C 的主站从 OIDC 登录自动恢复 A
      await c.goto(`${MAIN}/`);
      await c.waitForURL(/\/service/, { timeout: 30_000 });
      await expectMainAccount(c, USER_A);
      await openMenuItem(c, /退出所有关联应用/);
      await c.getByRole("alertdialog", { name: "退出 FloatCTF 及所有关联应用？" }).getByRole("button", { name: "退出所有关联应用" }).click();
      const report = c.getByRole("dialog", { name: "已退出 FloatCTF，但应用未全部同步" });
      await expect(report).toBeVisible({ timeout: 30_000 });
      await expect(report).toContainText("未送达，将自动重试");
    } finally {
      await setLearnosBackchannel(BACKCHANNEL_URI);
    }
    const rows = () =>
      opQuery<{ status: string; attempts: number; last_error: string | null }>(
        `select d.status, d.attempts, d.last_error from public.oidc_backchannel_deliveries d
           join public.oidc_clients k on k.id = d.oidc_client_id where k.client_id = $1 and d.sid = $2`,
        [CLIENT_ID, sidC],
      );
    const [pending] = await rows();
    expect(pending).toMatchObject({ status: "pending", attempts: 1 });
    expect(pending.last_error).toBeTruthy();
    // OP 身份会话已撤销；LearnOS 会话在通知送达前仍然有效（不谎报成功）
    expect((await sessionRow(sidC)).revoked_at).not.toBeNull();
    expect(await learnosUserId(c)).toBe(learnosAlice);

    // 网络恢复：让该行立即到期，等后台重试（30 秒一轮）
    await opQuery(
      `update public.oidc_backchannel_deliveries d set next_attempt_at = now()
         from public.oidc_clients k where k.id = d.oidc_client_id and k.client_id = $1 and d.sid = $2`,
      [CLIENT_ID, sidC],
    );
    await expect.poll(async () => (await rows())[0].status, { timeout: 75_000, intervals: [2_000] }).toBe("delivered");
    expect(await learnosUserId(c)).toBeNull();
  });

  test("U08 LearnOS「退出 FloatCTF…」：标准 RP-Initiated Logout，经 FloatCTF 确认后回到 LearnOS", async () => {
    const d = contexts[contexts.length - 1].pages()[0];
    const sidD = await learnosSessionSid(d);
    await d.goto(`${LEARN}/courses`);
    await d.getByRole("button", { name: "退出 FloatCTF 及所有应用" }).click();
    await d.getByRole("button", { name: "继续退出" }).click();
    await d.waitForURL(new RegExp(`^${OP}/oauth/end-session`), { timeout: 30_000 });
    await expect(d.getByRole("heading", { name: "退出 FloatCTF 及关联应用？" })).toBeVisible();
    // LearnOS 自己的会话在跳转前已结束
    expect(await learnosUserId(d)).toBeNull();
    // 所有关联应用都确认收到退出通知 → OP 直接回到登记的 post_logout_redirect_uri（带 state）；
    // 有未同步的应用时 OP 会停在结果页逐个列出（主站路径的 A14 覆盖该分支）。
    await d.getByRole("button", { name: "退出", exact: true }).click();
    await d.waitForURL(/\/login\?reason=global_signed_out/, { timeout: 30_000 });
    expect((await sessionRow(sidD)).revoked_at).not.toBeNull();
    await expect(d.getByText("已在 FloatCTF 完成退出确认")).toBeVisible();
    // 浏览器 A 中的 B 不受影响（不同设备）
    expect((await liveSids(bob.id)).length).toBeGreaterThanOrEqual(1);
  });

  test("A09 选择页退出单个账号；主站退出本浏览器全部账号；之后 SSO 需要密码", async ({ browser }) => {
    const e = await open(browser);
    await e.goto(`${MAIN}/`);
    await mainLogin(e, USER_A);
    await openMenuItem(e, "添加账号");
    await mainLogin(e, USER_B);
    expect((await mainStatus(e)).accounts).toHaveLength(2);

    await clickFloatctfLogin(e);
    await expect(chooserAccounts(e)).toHaveCount(2);
    await e.locator("summary", { hasText: "退出账号" }).click();
    await e.getByRole("button", { name: `在本浏览器退出 ${bob.nickname}（@${USER_B}）` }).click();
    await expect(e.getByText("已在本浏览器退出所选账号")).toBeVisible();
    await expect(chooserAccounts(e)).toHaveCount(1);
    await expect(chooserAccounts(e)).toContainText(`@${USER_A}`);
    const after = await mainStatus(e);
    expect(after.accounts.map((x) => x.username)).toEqual([USER_A]);
    await e.getByRole("button", { name: /取消，返回/ }).click();
    await e.waitForURL(/\/login/);

    // 主站当前账号 B 已被移除：主站不自动换成 A，而是在登录页列出剩余的真实账号让用户明确选择
    await e.goto(`${MAIN}/service/top`);
    await e.waitForURL(`${MAIN}/`);
    const picker = e.getByRole("list", { name: "本浏览器中已登录的账号" });
    await expect(picker.getByRole("button")).toHaveCount(1);
    await expect(picker).toContainText(`@${USER_A}`);
    expect((await mainStatus(e)).authenticated).toBe(false);
    await picker.getByRole("button").click();
    await e.waitForURL(/\/service/);
    await expectMainAccount(e, USER_A);

    await openMenuItem(e, "添加账号");
    await mainLogin(e, USER_B);
    await openMenuItem(e, "退出本浏览器中的全部账号");
    await e.getByRole("alertdialog", { name: "退出本浏览器中的全部账号？" }).getByRole("button", { name: "全部退出" }).click();
    await e.waitForURL(`${MAIN}/`);
    const none = await mainStatus(e);
    expect(none.authenticated).toBe(false);
    expect(none.accounts).toHaveLength(0);
    await expect(e.getByLabel("本浏览器中已登录的账号")).toHaveCount(0);

    await clickFloatctfLogin(e);
    await expect(e).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
  });

  test("A19 用户 Cookie 不能访问管理接口；CLI Bearer 令牌仍然可用", async ({ browser }) => {
    const page = await open(browser);
    await page.goto(`${MAIN}/`);
    await mainLogin(page, USER_A);
    const { csrf_token } = await mainStatus(page);
    for (const path of ["/api/admin/oidc/clients", "/api/admin/users"]) {
      const response = await page.request.get(`${MAIN}${path}`, { headers: { "X-CSRF-Token": csrf_token ?? "" } });
      expect(response.status(), path).toBe(401);
    }
    const me = await page.request.get(`${MAIN}/api/users/me`, { headers: { "X-CSRF-Token": csrf_token ?? "" } });
    expect(me.status()).toBe(200);

    const cli = await browser.newContext();
    const token = (await (
      await cli.request.post(`${MAIN}/api/users/session`, { data: { username: USER_B, password: PASSWORD } })
    ).json()) as { data: string };
    const bearer = await cli.request.get(`${MAIN}/api/users/me`, { headers: { Authorization: `Bearer ${token.data}` } });
    expect(bearer.status()).toBe(200);
    expect(((await bearer.json()) as { data: { username: string } }).data.username).toBe(USER_B);
    expect((await cli.request.get(`${MAIN}/api/admin/oidc/clients`, { headers: { Authorization: `Bearer ${token.data}` } })).status()).toBe(401);
    await cli.close();
  });

  test("A20 Cookie 写接口的 CSRF/跨站防护；退出通知地址不能指向内网", async () => {
    const page = contexts[contexts.length - 1].pages()[0];
    const { csrf_token } = await mainStatus(page);
    expect(csrf_token).toBeTruthy();
    const logout = (headers: Record<string, string>) =>
      page.request.post(`${MAIN}/api/users/web-session/logout`, { data: { scope: "browser" }, headers });
    expect((await logout({})).status()).toBe(403); // 缺 CSRF 头
    expect((await logout({ "X-CSRF-Token": "forged" })).status()).toBe(403);
    expect((await logout({ "X-CSRF-Token": csrf_token!, Origin: "https://evil.example" })).status()).toBe(403);
    expect((await mainStatus(page)).authenticated).toBe(true);
    // Login CSRF：跨站 Origin 不能把浏览器登录到别人的账号
    const login = await page.request.post(`${MAIN}/api/users/web-session/login`, {
      data: { username: USER_B, password: PASSWORD },
      headers: { Origin: "https://evil.example", "X-CSRF-Token": "anonymous" },
    });
    expect(login.status()).toBe(403);
    expect((await mainStatus(page)).user?.username).toBe(USER_A);

    // SSRF（登记期）：明文 HTTP、userinfo、fragment 一律拒绝
    const created = await page.request.post(`${MAIN}/api/oidc/clients`, {
      headers: { "X-CSRF-Token": csrf_token! },
      data: {
        name: "SSRF probe",
        client_type: "public",
        homepage_url: "https://probe.example",
        redirect_uris: ["https://probe.example/cb"],
        scopes: ["openid"],
      },
    });
    expect(created.ok()).toBe(true);
    const probeId = ((await created.json()) as { data: { client: { client_id: string } } }).data.client.client_id;
    for (const target of [
      "http://learn.example/api/oidc/backchannel-logout",
      "https://user:pw@learn.example/logout",
      "https://learn.example/logout#frag",
    ]) {
      const response = await page.request.patch(`${MAIN}/api/oidc/clients/${probeId}`, {
        headers: { "X-CSRF-Token": csrf_token! },
        data: {
          name: "SSRF probe",
          homepage_url: "https://probe.example",
          redirect_uris: ["https://probe.example/cb"],
          scopes: ["openid"],
          backchannel_logout_uri: target,
        },
      });
      expect(response.status(), target).toBe(400);
    }
    await page.request.delete(`${MAIN}/api/oidc/clients/${probeId}`, { headers: { "X-CSRF-Token": csrf_token! } });

    // SSRF（投递期）：登记地址解析到环回/内网且不在运维白名单 → 拒绝投递，不重试，如实报告；LearnOS 会话不受影响
    await clickFloatctfLogin(page);
    await chooseAccount(page, USER_A);
    await page.waitForURL(/\/courses/);
    const sid = await learnosSessionSid(page);
    await setLearnosBackchannel(`https://127.0.0.1:${new URL(LEARN).port || "443"}/api/oidc/backchannel-logout`);
    try {
      await page.goto(`${MAIN}/service/top`);
      await openMenuItem(page, /退出所有关联应用/);
      await page
        .getByRole("alertdialog", { name: "退出 FloatCTF 及所有关联应用？" })
        .getByRole("button", { name: "退出所有关联应用" })
        .click();
      const report = page.getByRole("dialog", { name: "已退出 FloatCTF，但应用未全部同步" });
      await expect(report).toBeVisible({ timeout: 30_000 });
      await expect(report).toContainText("未能确认");
    } finally {
      await setLearnosBackchannel(BACKCHANNEL_URI);
    }
    const [refused] = await opQuery<{ status: string; last_error: string | null }>(
      `select d.status, d.last_error from public.oidc_backchannel_deliveries d
         join public.oidc_clients k on k.id = d.oidc_client_id where k.client_id = $1 and d.sid = $2`,
      [CLIENT_ID, sid],
    );
    expect(refused.status).toBe("failed");
    expect(refused.last_error).toContain("非公网");
    expect(await learnosUserId(page)).toBe(learnosAlice);
  });
});
