# FloatCTF OIDC 接入（Supabase custom:floatctf）

## 状态

**代码脚手架已就绪，生产入口默认关闭（`FLOATCTF_OIDC_ENABLED=false`）。**

在目标 Supabase Auth `gotrue:v2.197.0` 与 FloatCTF 当前 `main` 上完成真实协议测试后，发现两个必须由 FloatCTF 或 Supabase Auth 侧修复的兼容性障碍。本文保留复现步骤与安全实现，避免用伪造邮箱验证、直信 ID Token 访问 RLS 或自建 JWT 绕过。

## 架构

```text
浏览器 → LearnOS /login
      → supabase.auth.signInWithOAuth("custom:floatctf")
      → Supabase Auth /auth/v1/authorize
      → FloatCTF OIDC authorize/login/consent
      → Supabase /auth/v1/callback（code + PKCE）
      → LearnOS /auth/callback（Supabase 会话）
      → profiles（默认 student）→ /courses
```

- FloatCTF：外部 OIDC Identity Provider。
- Supabase Auth：唯一的会话管理者；不把 FloatCTF ID Token 当 Supabase JWT。
- LearnOS：profiles 角色、准入策略与全部学习业务。

## 已实现

- 登录页「使用 FloatCTF 登录」入口（由 `FLOATCTF_OIDC_ENABLED=true` 开启）。
- `/auth/callback`：`exchangeCodeForSession`、安全 `next` 白名单、停用用户处理、错误回登录页。
- 首次登录：只创建 `student` profile；角色绝不读取 FloatCTF 资料。
- 已有账号手动绑定：`/account/connections` + `linkIdentity`，保留原 `auth.users.id` 与全部学习记录。
- 准入 Hook：`before_user_created_floatctf` 只放行 `custom:floatctf`；公开邮箱注册返回 403。
- `pnpm oidc:setup`：Discovery 校验 + 幂等创建/更新 `custom:floatctf`。
- Supabase 配置：`enable_manual_linking=true`、邮箱确认开启（防止未验证邮箱自动合并）、OIDC 入口默认关闭。
- profile 触发器支持从 `name/preferred_username/nickname/sub` 生成显示名。

## 实测结果（2026-10-23）

环境：GoTrue `v2.197.0`；FloatCTF 最新 `main`（Rust API + PostgreSQL/Redis/RustFS，测试账号 `1000000/testuser`）；真实 Chromium。

### FloatCTF 侧通过

- Discovery：issuer、authorization/token/jwks/userinfo 端点正确。
- `response_types_supported=["code"]`、`code_challenge_methods_supported=["S256"]`。
- JWKS 可验，ID Token 为 RS256；`iss/aud/nonce/at_hash` 正确。
- Token 端点：`client_secret_basic` 与 `client_secret_post` 均可；实测返回 `token_type: "Bearer"`。
- UserInfo：`sub/preferred_username/nickname/name` 正常；`openid email` 时 `email_verified` 恒为 `false`。
- 完整 PKCE 授权码流程（授权码 → token → UserInfo）通过。

### Supabase 侧阻塞

**阻塞 1：GoTrue custom OIDC 不调用 UserInfo。**

`gotrue:v2.197.0` 的 `CustomOIDCProvider.GetUserData` 在响应含 `id_token` 时直接解析 ID Token 并返回；只有没有 ID Token 时才调用 UserInfo。FloatCTF 按 OIDC Core §5.4 只在 UserInfo 返回 `preferred_username/nickname/email`，ID Token 仅含 `sub/iss/aud/...`。

结果：Supabase 只能得到 `sub`，拿不到用户名/邮箱；使用 `email_optional=true` 可创建学生，但显示名只能回退。

**阻塞 2：FloatCTF CSP 与 Supabase 两跳回调不兼容（决定性）。**

FloatCTF 登录页 CSP：`form-action 'self' <Supabase callback origin>`。Supabase 的 `/auth/v1/callback` 会在 token 交换后再 302 到 LearnOS 的 `/auth/callback`，最终跳转 origin 不在 FloatCTF 的 `form-action` 白名单中。

真实 Chromium 报错：

```text
Sending form data to 'https://<floatctf>/oauth/login' violates the following
Content Security Policy directive:
"form-action 'self' http://127.0.0.1:54321".
```

用三端口最小页面独立复现：Chrome 对表单 POST 后的跨源重定向目标也执行 `form-action` 校验。直接访问本地 FloatCTF HTTPS 端口同样复现，排除 Pinggy/隧道伪影。

**该 CSP 由 `txn.redirect_uri` 推导，而 Supabase 传给 FloatCTF（经 GoTrue）的 `redirect_uri` 是 `<Supabase>/auth/v1/callback`。**换句话说，只要 Supabase 在中间再做一跳「callback → LearnOS」，FloatCTF 的 CSP 就无法覆盖最终 origin。修复需要 FloatCTF 把 LearnOS origin 纳入 `form-action`（例如读取并校验客户端登记的 homepage_url，或支持 Supabase 的 `redirect_to`），这是上游改动。

**决定性约束（已核对 GoTrue 源码）**：`utilities.ValidateOAuthURL` 同时要求 `https`、主机不是 `localhost/127.0.0.1/::1/0.0.0.0`、解析结果不是 loopback/RFC1918/链路本地；并且 `ssrfProtectedTransport.RoundTrip` 会在**每次** discovery/JWKS 请求时重新校验。FloatCTF 则只允许 loopback 使用 http。两者叠加后，**本地不存在任何可同时满足的 issuer**——GoTrue 拒绝 loopback，FloatCTF 拒绝公网 http。因此真实 SSO 只能在公网 HTTPS 环境验证。

## 解除阻塞所需变更（二选一）

1. **FloatCTF（推荐）**：CSP `form-action` 增加 RP 最终回跳 origin（LearnOS 的 `/auth/callback` origin），并可选在 ID Token 中加入 `preferred_username/nickname`（不要加入未验证 email 以避免自动合并）。
2. **Supabase Auth**：升级/补丁 GoTrue 使其对 custom OIDC 调用 UserInfo；同时仍需解决 FloatCTF CSP 的两跳回调问题，或在 Supabase callback 与 LearnOS 之间改为同源不跳转的方案。

在任一项完成前，不应把 `FLOATCTF_OIDC_ENABLED` 设为 true。

## 上线前自检

```bash
pnpm oidc:verify
```

逐项检查（不通过即以非零码退出，并打印修复方向）：

1. issuer 是否满足 Supabase 约束（https 且非 loopback/私有地址）；
2. discovery 可达且 `issuer` 逐字节一致；
3. `response_types=code` 与 `code_challenge_methods=S256`；
4. JWKS 可拉取（避免 `fetching keys context deadline exceeded`）；
5. CSP `form-action` 是否覆盖「Supabase 回调 → LearnOS」两跳；
6. Supabase 中 `custom:floatctf` 的 enabled/issuer/client_id 是否与本应用一致。

2026-10-23 在本地的实测输出：`4/7 项通过`，未通过项为 issuer 约束、CSP 两跳、provider 配置不一致——与前文阻塞一致。

## 验收测试

`tests/e2e/floatctf-sso.spec.ts` 覆盖需求中的六类场景：

| 场景 | 需要真实 IdP |
| --- | --- |
| 首次登录创建 student 账号 | 是 |
| 重复登录复用同一用户与学习记录 | 是 |
| 已有账号手动绑定后保留原用户 ID | 是 |
| 停用账号无法进入受保护页面 | 是 |
| 退出后重新登录进入同一账号 | 是 |
| IdP 账号不被按邮箱自动合并 | 是 |
| 授权失败 / 缺少 code / 绑定失败 / 非法 next 回跳 | 否（始终运行） |

需要真实 IdP 的用例默认 `skipped`，启用条件：

```bash
E2E_FLOATCTF_SSO=1 \
E2E_FLOATCTF_USERNAME=<IdP 测试账号> \
E2E_FLOATCTF_PASSWORD=<密码> \
FLOATCTF_OIDC_ENABLED=true \
pnpm test:e2e
```

失败回跳的 4 个用例始终运行，防止 callback 错误路径回归。

## 配置步骤

```bash
# 1. 在 FloatCTF 创建 OIDC 应用，登记：
#    <Supabase URL>/auth/v1/callback
#    （本地为 http://127.0.0.1:54321/auth/v1/callback，需 allow_loopback_redirect_uris）

# 2. LearnOS 环境
FLOATCTF_OIDC_ENABLED=true
FLOATCTF_ALLOW_SIGNUP=true
FLOATCTF_OIDC_ISSUER=https://ctf.example.com
FLOATCTF_OIDC_CLIENT_ID=...
FLOATCTF_OIDC_CLIENT_SECRET=...

# 3. 创建/更新 Supabase custom:floatctf
pnpm oidc:setup

# 4. 验证
pnpm oidc:setup --check
```

## 安全约束

- 不按邮箱自动合并：FloatCTF email 未验证；Supabase `enable_confirmations=true`，OIDC scope 不请求 email。
- 手动绑定必须从已登录 LearnOS 账号发起；绑定保留 `auth.users.id`、profiles、enrollments、notes、points。
- OIDC 用户默认 student；只有 `profiles.role`（管理员显式操作）能成为 admin。
- 停用用户：callback 与页面守卫均检查 `profiles.disabled_at`，并清除 Supabase 会话。
- 管理员邮箱密码登录保留；公开邮箱注册由 DB Hook 拒绝。

## 回滚

- 删除 Supabase custom provider：
  `curl -X DELETE "$SUPABASE_URL/auth/v1/admin/custom-providers/custom:floatctf" -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY"`
- 将 `FLOATCTF_OIDC_ENABLED=false`，登录页回到邮箱密码。
- 保留 migration 与 profiles 不变；不影响已有用户 ID 与学习数据。

## 验证证据（2026-10-23）

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| Lint | `pnpm lint` | 0 error（1 条既有告警，notes-panel） |
| 类型 | `pnpm typecheck` | 通过 |
| 单元/集成 | `pnpm test` | 20 文件 / 124 测试通过（含 `tests/unit/oidc.test.ts`） |
| RLS | `pnpm test:rls` | 9 测试通过（真实 PostgreSQL） |
| 构建 | `pnpm build` | 通过 |
| E2E | `pnpm test:e2e` | 20/20 通过 |
| 管理员密码登录 | 真实 Supabase `token?grant_type=password` | HTTP 200 |
| 公开邮箱注册 | `POST /auth/v1/signup` | HTTP 403「LearnOS 账号由管理员发放，或使用 FloatCTF 登录」 |
| 管理员建号 | `POST /auth/v1/admin/users` | HTTP 200，profile 自动创建且 role=student |
| 绑定页 | 真实浏览器访问 `/account/connections` | 渲染账号信息与绑定按钮 |
| FloatCTF 协议 | Discovery/JWKS/PKCE/Token/UserInfo | 全部通过（见上文实测） |
| 真实 SSO 浏览器登录 | Chromium 经 Supabase 至 FloatCTF | **失败**：CSP `form-action` 拦截 Supabase → LearnOS 最终跳转 |

## 未完成项

- 真实 SSO 的首次登录、重复登录、已有账号绑定、停用账号、失败回跳、退出重登：因阻塞 2 未能在浏览器中完成。
- 生产部署：未部署。`FLOATCTF_OIDC_ENABLED=false`，线上行为与改动前一致。

## 对照实验：仅修补 CSP 后的链路结果（2026-10-23）

为确认「阻塞 2 解除后 LearnOS 侧是否可用」，在本地 FloatCTF 副本上做了**仅供验证、不提交**的最小补丁：`pages::html` 的 `form-action` 追加一个由环境变量提供的额外 origin（`FCTF_TEST_EXTRA_FORM_ORIGIN`），并重新编译 `floatctf` crate。

结果：

1. CSP 拦截消失，浏览器顺利通过 FloatCTF 登录页并回到 `<Supabase>/auth/v1/callback`。
2. 链路推进到 Supabase 的 token 交换，GoTrue 日志给出新的失败点：

```text
"error":"failed to verify ID token: failed to verify signature: fetching keys context deadline exceeded"
"error":"context deadline exceeded","error_code":"request_timeout","status":504
```

3. 根因是 GoTrue 拉取 JWKS 超时（默认约 10s），而经公网隧道单次请求耗时约 4.6–5.3s。该现象属于测试隧道特性，不是协议缺陷：在正常网络下 JWKS 可缓存。

结论：**CSP 是本链路唯一的结构性阻塞**；解除后剩余问题只是测试环境的隧道延迟。这也说明阻塞 1（GoTrue 不调用 UserInfo）不会阻断登录本身——`email_optional=true` 已让 Supabase 接受无邮箱的 OIDC 用户，代价是 `user_metadata` 里没有用户名，需要由 LearnOS 侧回退显示名。

环境已复原：补丁未进入任何提交，FloatCTF 二进制已回退到未打补丁版本使用，LearnOS `FLOATCTF_OIDC_ENABLED=false`。
