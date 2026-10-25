import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { Pool } from "pg";

import { api, getCourseBySlug, query, queryOne } from "./helpers";

/**
 * Real two-application acceptance: LearnOS (Better Auth RP) × FloatCTF (OIDC OP)
 * in a real browser, both over HTTPS with a certificate the browser and Node
 * actually verify (no ignoreHTTPSErrors).
 *
 * Covers: first login → sign out of LearnOS → FloatCTF account chooser →
 * continue (no password, no repeated consent) / cancel / use another account
 * (password + its own consent) → data isolation between the two LearnOS users,
 * double-click, account change in another tab, cross-site POST, unregistered
 * redirect_uri, a legacy RP that sends no prompt, prompt=none, and an
 * invalidated FloatCTF session.
 *
 * Required environment (see docs/oidc-floatctf.md「账号选择 E2E」):
 *   E2E_FLOATCTF_CHOOSER=1
 *   FLOATCTF_OIDC_ISSUER                     https issuer of the OP under test
 *   FLOATCTF_E2E_DB_URL                      the OP's (isolated) database, for assertions only
 *   E2E_FLOATCTF_USER_A / E2E_FLOATCTF_USER_B / E2E_FLOATCTF_PASSWORD
 *   E2E_FLOATCTF_LEGACY_CLIENT_ID            public client, redirect https://legacy-rp.test/callback
 */
const enabled =
  process.env.E2E_FLOATCTF_CHOOSER === "1" &&
  Boolean(process.env.FLOATCTF_OIDC_ISSUER) &&
  Boolean(process.env.FLOATCTF_E2E_DB_URL) &&
  Boolean(process.env.E2E_FLOATCTF_USER_A) &&
  Boolean(process.env.E2E_FLOATCTF_USER_B) &&
  Boolean(process.env.E2E_FLOATCTF_PASSWORD);

const OP = (process.env.FLOATCTF_OIDC_ISSUER ?? "").replace(/\/$/, "");
const USER_A = process.env.E2E_FLOATCTF_USER_A ?? "";
const USER_B = process.env.E2E_FLOATCTF_USER_B ?? "";
const PASSWORD = process.env.E2E_FLOATCTF_PASSWORD ?? "";
const LEGACY_CLIENT = process.env.E2E_FLOATCTF_LEGACY_CLIENT_ID ?? "";
const LEGACY_REDIRECT = "https://legacy-rp.test/callback";
// RFC 7636 Appendix B
const VERIFIER_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

const op = enabled ? new Pool({ connectionString: process.env.FLOATCTF_E2E_DB_URL, max: 2 }) : null;

async function opQuery<T>(text: string, values: unknown[] = []): Promise<T[]> {
  return (await op!.query(text, values)).rows as T[];
}

async function floatctfUser(username: string) {
  const [row] = await opQuery<{ id: string; nickname: string }>(
    "select id::text, nickname from public.users where username = $1",
    [username],
  );
  if (!row) throw new Error(`FloatCTF user ${username} missing`);
  return row;
}

async function codesIssued(): Promise<number> {
  const [row] = await opQuery<{ n: number }>(
    `select count(*)::int as n from public.oidc_authorization_codes c
       join public.oidc_clients k on k.id = c.oidc_client_id
      where k.client_id = $1`,
    [process.env.FLOATCTF_OIDC_CLIENT_ID],
  );
  return row.n;
}

/** The LearnOS user the browser is currently signed in as (via the real session endpoint). */
async function learnosUserId(page: Page): Promise<string | null> {
  const response = await page.request.get("/api/auth/get-session");
  const body = (await response.json().catch(() => null)) as { user?: { id: string } } | null;
  return body?.user?.id ?? null;
}

/** LearnOS user bound to a FloatCTF subject through Better Auth's (provider, account_id). */
async function learnosUserFor(floatctfSub: string): Promise<string | null> {
  const row = await queryOne<{ user_id: string }>(
    "select user_id from public.account where provider_id = 'floatctf' and account_id = $1",
    [floatctfSub],
  );
  return row?.user_id ?? null;
}

function mainFrameNavigations(page: Page): string[] {
  const urls: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) urls.push(frame.url());
  });
  return urls;
}

function oauthCallbacks(page: Page): URL[] {
  const urls: URL[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/auth/callback/floatctf")) urls.push(new URL(request.url()));
  });
  return urls;
}

async function clickFloatctfLogin(page: Page) {
  await page.goto("/login");
  // Better Auth 对 /sign-in/* 限流（默认 10 秒 3 次）且本套件保持限流开启：
  // 被限流时按 X-Retry-After 等待后重试，而不是关掉这项保护。
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = page.waitForResponse((r) => r.url().includes("/api/auth/sign-in/social"));
    await page.getByRole("button", { name: "使用 FloatCTF 登录" }).click();
    const result = await response;
    if (result.status() !== 429) break;
    await expect(page.getByRole("alert").filter({ hasText: "操作过于频繁" })).toBeVisible();
    const wait = Number(result.headers()["x-retry-after"] ?? "10");
    await page.waitForTimeout((Number.isFinite(wait) ? wait : 10) * 1000 + 500);
  }
  await page.waitForURL((url) => url.origin === OP, { timeout: 30_000 });
}

async function signOutOfLearnOS(page: Page) {
  await page.getByRole("button", { name: "退出 LearnOS" }).click();
  await page.waitForURL(/\/login\?reason=signed_out/);
  await expect(page.getByText("已退出 LearnOS。这不会退出 FloatCTF")).toBeVisible();
}

async function expectChooserFor(page: Page, username: string, nickname: string) {
  // GET 打开的选择页带 ?txn=；POST 后要求重新确认时是同一地址的表单响应
  await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/select-account(\\?txn=|$)`));
  await expect(page.getByRole("heading", { name: "选择账号" })).toBeVisible();
  await expect(page.getByText(nickname, { exact: true })).toBeVisible();
  await expect(page.getByText(`@${username}`, { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
}

async function passwordLogin(page: Page, username: string) {
  await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
  await page.locator('input[name="username"]').fill(username);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/oauth/login"), { timeout: 30_000 });
}

async function allowConsent(page: Page) {
  await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/consent\\?txn=`));
  await page.getByRole("button", { name: "允许" }).click();
}

test.describe.configure({ mode: "serial" });

test.describe("FloatCTF 账号选择（真实 LearnOS × FloatCTF）", () => {
  test.skip(!enabled, "需要真实 FloatCTF OP 与隔离数据库：见文件头注释的环境变量");

  let context: BrowserContext;
  let page: Page;
  let alice: { id: string; nickname: string };
  let bob: { id: string; nickname: string };
  let learnosAlice: string;
  let learnosBob: string;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    alice = await floatctfUser(USER_A);
    bob = await floatctfUser(USER_B);
    // 干净起点（仅隔离测试库）：OP 侧撤销两人的 SSO 会话与授权记录，
    // LearnOS 侧删除这两个 FloatCTF 身份的旧绑定与资料。
    await opQuery(
      "update public.oidc_browser_sessions set revoked_at = now() where user_id = any($1::uuid[]) and revoked_at is null",
      [[alice.id, bob.id]],
    );
    await opQuery("delete from public.oidc_consents where user_id = any($1::uuid[])", [[alice.id, bob.id]]);
    for (const sub of [alice.id, bob.id]) {
      const userId = await learnosUserFor(sub);
      if (!userId) continue;
      await query("delete from public.profiles where user_id = $1", [userId]);
      await query('delete from public."user" where id = $1', [userId]);
    }
  });

  test.afterAll(async () => {
    await context?.close();
    await op?.end();
  });

  test("01 首次登录：无 SSO → 密码 → 授权 → LearnOS A；回调只带 code/state/iss", async () => {
    const callbacks = oauthCallbacks(page);
    await clickFloatctfLogin(page);
    await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
    await passwordLogin(page, USER_A);
    await allowConsent(page);
    await page.waitForURL(/\/courses/);

    learnosAlice = (await learnosUserFor(alice.id))!;
    expect(learnosAlice).toBeTruthy();
    expect(await learnosUserId(page)).toBe(learnosAlice);

    const callback = callbacks.at(-1)!;
    expect([...callback.searchParams.keys()].sort()).toEqual(["code", "iss", "state"]);
    expect(callback.searchParams.get("iss")).toBe(OP);

    // A 的学习记录：报名 + 一条笔记（之后用来验证 B 读不到）
    const course = await getCourseBySlug("http-fundamentals");
    const joined = await api(page, "/api/enrollments", "POST", { courseId: course.id });
    expect(joined.status).toBe(200);
    const lesson = await queryOne<{ id: string }>(
      "select id from public.lessons where course_id = $1 order by position limit 1",
      [course.id],
    );
    const note = await api(page, `/api/notes/${lesson!.id}`, "PUT", { content: "alice-private-note" });
    expect(note.status).toBe(200);
  });

  test("02/03/17 退出 LearnOS 只结束本地会话；再次登录必现选择页，继续 A 免密码免重复同意", async () => {
    await signOutOfLearnOS(page);
    // LearnOS 会话确实失效
    expect(await learnosUserId(page)).toBeNull();
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/login/);
    const sessions = await query("select id from public.session where user_id = $1", [learnosAlice]);
    expect(sessions).toHaveLength(0);
    // FloatCTF 统一登录不受影响（LearnOS 没有、也不能清除它）
    const sso = (await context.cookies(OP)).find((c) => c.name === "__Host-fctf_sso");
    expect(sso?.httpOnly).toBe(true);
    expect(sso?.secure).toBe(true);

    const codesBefore = await codesIssued();
    const navigations = mainFrameNavigations(page);
    await clickFloatctfLogin(page);
    await expectChooserFor(page, USER_A, alice.nickname);
    await page.screenshot({ path: "test-results/floatctf-account-chooser.png" });
    // 不点击就不会返回 LearnOS，也不会发码
    await page.waitForTimeout(2_000);
    await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/select-account`));
    expect(await codesIssued()).toBe(codesBefore);

    await page.getByRole("button", { name: "继续使用此账号" }).click();
    await page.waitForURL(/\/courses/);
    expect(await learnosUserId(page)).toBe(learnosAlice);
    const afterChooser = navigations.slice(navigations.findIndex((u) => u.includes("/oauth/select-account")));
    expect(afterChooser.some((u) => u.includes("/oauth/login"))).toBe(false);
    expect(afterChooser.some((u) => u.includes("/oauth/consent"))).toBe(false);
    expect(await codesIssued()).toBe(codesBefore + 1);
    // A 的学习记录仍然属于 A
    const current = await api(page, "/api/enrollments/current");
    expect(current.body?.data?.course?.slug).toBe("http-fundamentals");
  });

  test("11 取消选择：access_denied + state + iss 回到 LearnOS，不建立会话", async () => {
    await signOutOfLearnOS(page);
    const callbacks = oauthCallbacks(page);
    await clickFloatctfLogin(page);
    await expectChooserFor(page, USER_A, alice.nickname);
    await page.getByRole("button", { name: "取消" }).click();
    await page.waitForURL(/\/login\?reason=oauth_denied/);
    await expect(page.getByText("你已在 FloatCTF 取消登录")).toBeVisible();
    const callback = callbacks.at(-1)!;
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBeTruthy();
    expect(callback.searchParams.get("iss")).toBe(OP);
    expect(callback.searchParams.has("code")).toBe(false);
    expect(await learnosUserId(page)).toBeNull();
    await page.goto("/courses");
    await expect(page).toHaveURL(/\/login/);
  });

  test("04/22 使用其他账号：必须输入 B 的密码、B 独立授权；A/B 学习数据隔离", async () => {
    await clickFloatctfLogin(page);
    await expectChooserFor(page, USER_A, alice.nickname);
    await page.getByRole("button", { name: "使用其他账号" }).click();
    await expect(page.getByRole("heading", { name: "使用其他账号登录" })).toBeVisible();
    await expect(page.locator('input[name="username"]')).toHaveValue("");
    await passwordLogin(page, USER_B);
    // B 第一次使用 LearnOS：需要 B 自己的授权，不继承 A 的
    await expect(page.getByText(`${bob.nickname}（@${USER_B}）`).first()).toBeVisible();
    await expect(page.getByText(`@${USER_A}`)).toHaveCount(0);
    await allowConsent(page);
    await page.waitForURL(/\/courses/);

    learnosBob = (await learnosUserFor(bob.id))!;
    expect(learnosBob).toBeTruthy();
    expect(learnosBob).not.toBe(learnosAlice);
    expect(await learnosUserId(page)).toBe(learnosBob);
    const me = await api(page, "/api/me");
    expect(me.body?.data?.id).toBe(learnosBob);
    const current = await api(page, "/api/enrollments/current");
    expect(current.body?.data ?? null).toBeNull();
    const course = await getCourseBySlug("http-fundamentals");
    const lesson = await queryOne<{ id: string }>(
      "select id from public.lessons where course_id = $1 order by position limit 1",
      [course.id],
    );
    const note = await api(page, `/api/notes/${lesson!.id}`, "GET");
    expect(JSON.stringify(note.body)).not.toContain("alice-private-note");
    // 单当前会话：A 的 FloatCTF SSO 已被替换
    const [aliceLive] = await opQuery<{ n: number }>(
      "select count(*)::int as n from public.oidc_browser_sessions where user_id = $1 and revoked_at is null",
      [alice.id],
    );
    expect(aliceLive.n).toBe(0);
  });

  test("再次登录时选择页展示的是 B（不伪造账号列表）", async () => {
    await signOutOfLearnOS(page);
    await clickFloatctfLogin(page);
    await expectChooserFor(page, USER_B, bob.nickname);
    await expect(page.getByText(`@${USER_A}`)).toHaveCount(0);
    await page.getByRole("button", { name: "继续使用此账号" }).click();
    await page.waitForURL(/\/courses/);
    expect(await learnosUserId(page)).toBe(learnosBob);
  });

  test("16 双击「继续」：最多发一次授权码，最终身份仍是 B", async () => {
    await signOutOfLearnOS(page);
    await clickFloatctfLogin(page);
    await expectChooserFor(page, USER_B, bob.nickname);
    const before = await codesIssued();
    await page.getByRole("button", { name: "继续使用此账号" }).dblclick();
    await page.waitForLoadState("networkidle");
    expect(await codesIssued()).toBe(before + 1);
    const who = await learnosUserId(page);
    expect([null, learnosBob]).toContain(who);
    if (!who) {
      // 浏览器展示的是第二次提交的「已失效」页：重新登录即可，绝不会落到别的账号
      await expect(page.getByText("授权请求已过期或无效")).toBeVisible();
      await clickFloatctfLogin(page);
      await page.getByRole("button", { name: "继续使用此账号" }).click();
      await page.waitForURL(/\/courses/);
    }
    expect(await learnosUserId(page)).toBe(learnosBob);
  });

  test("15 另一标签页切换到 A：原标签点「继续」要求重新确认，绝不串号", async () => {
    await signOutOfLearnOS(page);
    await clickFloatctfLogin(page);
    await expectChooserFor(page, USER_B, bob.nickname);

    const tab2 = await context.newPage();
    await clickFloatctfLogin(tab2);
    await tab2.getByRole("button", { name: "使用其他账号" }).click();
    await passwordLogin(tab2, USER_A);
    // A 已授权过 LearnOS：不再出现同意页
    await tab2.waitForURL(/\/courses/);
    expect(await learnosUserId(tab2)).toBe(learnosAlice);
    await tab2.close();

    const before = await codesIssued();
    await page.getByRole("button", { name: "继续使用此账号" }).click();
    await expect(page.getByText("登录账号已发生变化")).toBeVisible();
    await expectChooserFor(page, USER_A, alice.nickname);
    await expect(page.getByText(`@${USER_B}`)).toHaveCount(0);
    expect(await codesIssued()).toBe(before);
    await page.getByRole("button", { name: "继续使用此账号" }).click();
    await page.waitForURL(/\/courses/);
    expect(await learnosUserId(page)).toBe(learnosAlice);
  });

  test("14 跨站伪造的选择页表单被拒绝", async () => {
    await signOutOfLearnOS(page);
    await clickFloatctfLogin(page);
    const txn = await page.locator('input[name="txn"]').inputValue();
    const csrf = await page.locator('input[name="csrf"]').inputValue();
    const before = await codesIssued();
    // 攻击者站点（另一个 origin，无 CSP）自动提交一个带正确 txn/csrf 的表单到真实 OP。
    // （不能用 LearnOS 页面充当攻击者：LearnOS 自己的 CSP form-action 'self' 会先拦下。）
    const attacker = "https://attacker.test/";
    await context.route(attacker, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><form method="post" action="${OP}/oauth/select-account">
          <input type="hidden" name="txn" value="${txn}">
          <input type="hidden" name="csrf" value="${csrf}">
          <input type="hidden" name="action" value="continue">
        </form><script>document.forms[0].submit()</script>`,
      }),
    );
    await page.goto(attacker);
    await page.waitForURL(`${OP}/oauth/select-account`);
    await expect(page.getByText(/请求来源无效|授权请求已过期或无效/)).toBeVisible();
    expect(await codesIssued()).toBe(before);
    expect(await learnosUserId(page)).toBeNull();
    await context.unroute(attacker);
  });

  test("未登记的 redirect_uri 停在 FloatCTF 错误页，不跳转", async () => {
    const url = new URL(`${OP}/oauth/authorize`);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: process.env.FLOATCTF_OIDC_CLIENT_ID ?? "",
      redirect_uri: "https://evil.example/callback",
      scope: "openid profile",
      state: "s",
      code_challenge: VERIFIER_CHALLENGE,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    const response = await page.goto(url.toString());
    expect(response?.status()).toBe(400);
    expect(new URL(page.url()).origin).toBe(OP);
    await expect(page.getByText("回调地址（redirect_uri）与该应用登记的地址不一致")).toBeVisible();
  });

  test("20/09 不传 prompt 的旧 RP 保持静默 SSO；prompt=none 不渲染页面", async () => {
    test.skip(!LEGACY_CLIENT, "未配置 E2E_FLOATCTF_LEGACY_CLIENT_ID");
    const hits: URL[] = [];
    const routed: URL[] = [];
    await context.route("https://legacy-rp.test/**", async (route) => {
      routed.push(new URL(route.request().url()));
      await route.fulfill({ status: 200, contentType: "text/plain", body: "legacy rp callback" });
    });
    const authorize = (extra: Record<string, string> = {}) => {
      const url = new URL(`${OP}/oauth/authorize`);
      url.search = new URLSearchParams({
        response_type: "code",
        client_id: LEGACY_CLIENT,
        redirect_uri: LEGACY_REDIRECT,
        scope: "openid profile",
        state: "legacy-state",
        code_challenge: VERIFIER_CHALLENGE,
        code_challenge_method: "S256",
        ...extra,
      }).toString();
      return url.toString();
    };
    const navigations = mainFrameNavigations(page);
    // 第一次：只需要该 RP 自己的同意（不出现选择页）
    await page.goto(authorize());
    await allowConsent(page);
    await page.waitForURL(/legacy-rp\.test\/callback/);
    expect(navigations.some((u) => u.includes("/oauth/select-account"))).toBe(false);
    hits.push(routed[0]);
    // 第二次 / prompt=none：与旧版一致，OP 直接 302 回 RP，不渲染任何页面。
    // （对这类由导航直接触发的跨站重定向，route 不一定拦得到，所以直接断言 OP 的 302 响应。）
    const silent = async (url: string) => {
      const redirect = page.waitForResponse((r) => r.url().startsWith(`${OP}/oauth/authorize`));
      await page.evaluate((target) => {
        window.location.href = target;
      }, url);
      const response = await redirect;
      expect(response.status()).toBe(302);
      const location = new URL(response.headers()["location"]);
      expect(location.origin + location.pathname).toBe(LEGACY_REDIRECT);
      await page.goto("about:blank");
      return location;
    };
    hits.push(await silent(authorize()));
    hits.push(await silent(authorize({ prompt: "none" })));
    for (const hit of hits) {
      expect(hit.searchParams.get("state")).toBe("legacy-state");
      expect(hit.searchParams.get("iss")).toBe(OP);
      expect(hit.searchParams.get("code")).toBeTruthy();
    }
    expect(hits).toHaveLength(3);
    await context.unroute("https://legacy-rp.test/**");
  });

  test("12 FloatCTF 会话失效后不会被展示为可继续的账号", async () => {
    await page.goto("/courses");
    if (await learnosUserId(page)) await signOutOfLearnOS(page);
    await opQuery(
      "update public.oidc_browser_sessions set revoked_at = now() where user_id = $1 and revoked_at is null",
      [alice.id],
    );
    await clickFloatctfLogin(page);
    await expect(page).toHaveURL(new RegExp(`^${OP}/oauth/login\\?txn=`));
    await expect(page.getByRole("heading", { name: "登录 FloatCTF" })).toBeVisible();
    await passwordLogin(page, USER_A);
    await page.waitForURL(/\/courses/);
    expect(await learnosUserId(page)).toBe(learnosAlice);
  });

  test("选择页在窄屏暗色下可用（截图留档）", async ({ browser }) => {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      colorScheme: "dark",
      storageState: await context.storageState(),
    });
    const phone = await mobile.newPage();
    await phone.goto("/courses");
    await signOutOfLearnOS(phone);
    await clickFloatctfLogin(phone);
    await expectChooserFor(phone, USER_A, alice.nickname);
    const width = await phone.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
    await phone.screenshot({ path: "test-results/floatctf-account-chooser-mobile-dark.png", fullPage: true });
    await phone.keyboard.press("Enter"); // autofocus 在「继续使用此账号」
    await phone.waitForURL(/\/courses/);
    await mobile.close();
  });
});
