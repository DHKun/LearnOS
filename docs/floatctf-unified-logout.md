# FloatCTF 统一身份：LearnOS（RP）侧的退出、会话撤销与验收

FloatCTF 作为统一身份中心（OP），LearnOS 作为独立的 OIDC RP：**共享的是 FloatCTF 的身份会话，LearnOS 通过标准 OIDC
换取自己的 Better Auth 会话**。LearnOS 从不接受 FloatCTF 的 Cookie，课程、进度、笔记、积分、角色都只在 LearnOS 库里。

OP 侧设计见 FloatCTF 仓库 `docs/identity/ADR-unified-identity.md`（附录 A：标准退出），上线顺序见
`docs/identity/oidc-operations.md` §11，测试证据见 `docs/identity/oidc-test-report.md` §9。

## 1. 三种退出（产品契约）

| 操作 | 入口 | 结果 |
|---|---|---|
| 退出 LearnOS | 顶栏「退出 LearnOS」 | 只删除 Better Auth 会话（并确认会话已真正为空）。FloatCTF 保持登录，再次「使用 FloatCTF 登录」先出现账号选择页 |
| 退出 FloatCTF | FloatCTF 主站账号菜单 / 账号选择页 | 只撤销 FloatCTF 的身份会话；LearnOS 已有会话**保留**，之后再经 FloatCTF 登录需要密码 |
| 退出 FloatCTF 及所有应用 | LearnOS 顶栏「退出 FloatCTF…」（仅经 FloatCTF 登录的会话显示）+ 确认；或 FloatCTF 主站「退出所有关联应用…」 | 先结束 LearnOS 会话，再到 FloatCTF 确认页（RP-Initiated Logout 1.0）；FloatCTF 撤销该身份会话并向已接入的应用投递 Logout Token（Back-Channel Logout 1.0） |

普通「退出 LearnOS」**永远不会**触发 FloatCTF 退出：Better Auth 只要在 Discovery 中看到 `end_session_endpoint`
就会把 `signOut` 变成 RP-Initiated Logout，所以 `lib/auth/better.ts` 设置了 `disableProviderLogout: true`。

## 2. 实现

| 位置 | 作用 |
|---|---|
| `lib/auth/floatctf-logout.ts` | 登录上下文（AsyncLocalStorage）、会话映射、Logout Token 验证、`jti` 防重放、精确撤销、`end_session` URL |
| `lib/auth/better.ts` | 「使用 FloatCTF 登录」成功建会话时记录 `(iss, sub, sid)`；ID Token 已由 Better Auth 按 JWKS + nonce 验证 |
| `app/api/oidc/backchannel-logout/route.ts` | Back-Channel 接收端点（服务端到服务端，不读浏览器 Cookie） |
| `components/global-logout-button.tsx`、`lib/auth/actions.ts` | 「退出 FloatCTF…」确认框 → 结束 LearnOS 会话 → 跳转 FloatCTF `end_session_endpoint`（`id_token_hint`、`client_id`、`post_logout_redirect_uri`、`state`） |
| `app/auth/signed-out/route.ts` | `post_logout_redirect_uri`：核对一次性 `state` Cookie 后回到 `/login?reason=global_signed_out` |
| `db/migrations/0001_floatctf_backchannel.sql` | 新表 `floatctf_oidc_sessions`（会话 ↔ `(iss, sid)`，随会话级联删除）、`floatctf_logout_jti` |

**Logout Token 验证**（任何一项失败 → 400，不撤销任何会话）：JWS RS256 且 `kid` 来自该 issuer 的 JWKS；
`typ = logout+jwt`；`iss` ∈ `FLOATCTF_OIDC_TRUSTED_ISSUERS`（缺省 = `FLOATCTF_OIDC_ISSUER`）；`aud` = 本应用 `client_id`；
`iat` 不在未来（60 秒容差）且不早于 10 分钟；`exp` 未过；`events` 含 `http://schemas.openid.net/event/backchannel-logout`；
**没有** `nonce`；有 `sid` 或 `sub`；`(iss, jti)` 首次出现。

**撤销范围**：有 `sid` → 只删除映射到 `(iss, sid)` 的 Better Auth 会话（同时带 `sub` 时还必须匹配 `sub`）；只有 `sub` → 删除 `(iss, sub)` 的会话。
其他学生、同一学生在其他设备上经其他 FloatCTF 登录建立的会话都不受影响。没有匹配会话也返回 200（该 sid 在本应用已无会话）；
数据库删除失败返回 400，FloatCTF 记为「未能确认」。LearnOS 没有开启 Better Auth `session.cookieCache`，删除会话行后
`getSession` 立即失效（E2E 用浏览器真实请求验证）。

## 3. 配置

```dotenv
FLOATCTF_OIDC_ENABLED=true
FLOATCTF_OIDC_ISSUER=https://ctf.example.com
FLOATCTF_OIDC_CLIENT_ID=...
FLOATCTF_OIDC_CLIENT_SECRET=...
# 可选：接受其 Logout Token 的 issuer（逗号分隔）；双 issuer 部署时列出本实例要接受的 issuer
# FLOATCTF_OIDC_TRUSTED_ISSUERS=https://ctf.example.com
```

在 FloatCTF 开发者中心为该应用登记：

- 退出后回跳地址：`<LearnOS>/auth/signed-out`
- 退出通知地址（Back-Channel）：`<LearnOS>/api/oidc/backchannel-logout`

FloatCTF 只向公网地址投递；LearnOS 在内网时，FloatCTF 运维要把 `host:port` 加入 `[oidc].backchannel_trusted_hosts`，
自签证书时配置 `backchannel_extra_ca_file`。FloatCTF 到 LearnOS 的 HTTPS 不可达时，投递会显示「未送达，将自动重试」并按退避重试，
不会被当成成功——这是部署阻塞，需要打通网络或登记受信任地址，不能用浏览器跳转代替。

## 4. 上线与回滚

1. 备份：`pg_dump "$LEARNOS_DB_URL" --format=custom > learnos-$(date +%F).dump`。
2. `pnpm db:migrate`（只新增两张表）→ 部署新版本（带 `disableProviderLogout`）。
3. **之后**才由 FloatCTF 打开 `[oidc].backchannel_logout`。顺序反过来会让普通「退出 LearnOS」变成全局退出。
4. 回滚：先请 FloatCTF 关闭 `backchannel_logout`，再部署上一版本；新表闲置即可，不删除。

用户关联不变：外部账号仍以 Better Auth `account (provider_id='floatctf', account_id=sub)` 识别，同一 issuer 的同一 `sub`
始终进入同一个 LearnOS 用户；不按邮箱合并。

## 5. 跨应用 E2E（真实浏览器 + 真实 HTTPS）

`tests/e2e/floatctf-unified-identity.spec.ts`（17 项，覆盖 FloatCTF PLAN A01–A15、A19、A20）需要一个开着统一身份开关的
FloatCTF（API + Default Frontend）和本仓库的 LearnOS，都经 HTTPS 提供，证书由测试 CA 签发且被浏览器与 Node 信任
（不使用 `ignoreHTTPSErrors`）。`floatctf-account-chooser.spec.ts` 针对**开关全部关闭**的旧模式，两套 spec 分开运行。

### 5.1 环境（本机做法，2026-10-26 验证）

1. 一次性容器：FloatCTF PostgreSQL 17（`127.0.0.1:55432/floatctf_db`）、Redis（`:56379`）、RustFS（`:59000`）、
   LearnOS PostgreSQL 17（`:55433/learnos`，`db/schema.sql` + `pnpm db:migrate` + `pnpm courses:sync`，把 `http-fundamentals` 设为 published，
   `ADMIN_EMAIL=admin@learnos.local ADMIN_PASSWORD='LearnOS-Admin-2025!' pnpm seed:admin`）。
2. 测试 CA + `ctf.localhost` / `learn.localhost` 服务器证书；Chrome 用独立 `HOME` 的 NSS 库信任 CA
   （`certutil -A -t "C,," -i ca.crt`）；Node 用 `NODE_EXTRA_CA_CERTS`。
3. Caddy（`--network host`）：`https://ctf.localhost:8443` 按 FloatCTF `scripts/install.sh` 内嵌模板（`/api/*`、OIDC 路径 → API，
   `/public/*` → RustFS `floatctf-public`，前端注册表 + Default Frontend 制品）；`https://learn.localhost:8444` → `next start :3010`，
   并把 Location 中的 `localhost:3010` 改写回对外 origin。私有 CA 下关闭 HTTP/3（`servers { protocols h1 h2 }`）。
4. FloatCTF API TOML：`issuer = "https://ctf.localhost:8443"`，`multi_account`、`unified_web_session`、`backchannel_logout = true`，
   `backchannel_trusted_hosts = ["learn.localhost:8444", "learn.localhost:8446"]`（8446 故意无人监听，用于 A14 网络不可达），
   `backchannel_extra_ca_file = <测试 CA>`。没有 Docker 宿主能力时用只应答 `/_ping` 的 unix socket 桩启动 API。
5. 种子：用户 `alice`、`bob`、`carol`（密码相同）；`carol` 在开发者中心登记 LearnOS（机密客户端，`client_secret_post`，
   回调 `<LearnOS>/api/auth/callback/floatctf`、上面两个退出地址）与一个 public「旧 RP」（回调 `https://legacy-rp.test/callback`），测试库中批准。
   `floatctf-public` 桶需要公开读策略（API 首次建桶时会设置；若桶先被测试工具建出则要补上）。
6. 整套 E2E 在同一 IP 上口令登录上百次：**只在隔离测试库**里调高 FloatCTF 设置 `OIDC_LOGIN_RATE_PER_USER`、`OIDC_LOGIN_RATE_PER_IP`。

### 5.2 运行

```bash
export E2E_BASE_URL=https://learn.localhost:8444
export FLOATCTF_OIDC_ISSUER=https://ctf.localhost:8443 FLOATCTF_MAIN_URL=https://ctf.localhost:8443
export FLOATCTF_OIDC_CLIENT_ID=... FLOATCTF_E2E_DB_URL=postgres://postgres:postgres@127.0.0.1:55432/floatctf_db
export E2E_FLOATCTF_USER_A=alice E2E_FLOATCTF_USER_B=bob E2E_FLOATCTF_PASSWORD='...'
export E2E_FLOATCTF_LEGACY_CLIENT_ID=... E2E_FLOATCTF_PARTITION_HOST=learn.localhost:8446
E2E_FLOATCTF_UNIFIED=1 pnpm exec playwright test tests/e2e/floatctf-unified-identity.spec.ts
# 旧模式（FloatCTF 三个开关全部关闭）：
E2E_FLOATCTF_CHOOSER=1 pnpm exec playwright test tests/e2e/floatctf-account-chooser.spec.ts
```

`FLOATCTF_E2E_DB_URL` 只用于断言与准备隔离测试库（撤销测试账号旧会话、删除授权、临时改 LearnOS 应用的退出通知地址），
**不得指向生产库**。
