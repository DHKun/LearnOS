# Keycloak 作为内网 SSO Broker

## 目标

FloatCTF 在内网、无公网域名。Supabase Auth 的 `custom:floatctf` OIDC provider 会强制
HTTPS 且拒绝私有 IP，因此不再使用它。改为：

```text
LearnOS → Supabase Auth（内置 keycloak provider）
        → Keycloak（内网，realm=learnos）
        → Keycloak Identity Provider: FloatCTF（内网 OIDC）
        → FloatCTF 登录/同意
        → 回调 Keycloak → 回调 Supabase → 回调 LearnOS
```

Supabase 仍负责会话、`auth.users`、profiles、RLS；Keycloak 只做协议转换与身份代理。

## 为什么可行

GoTrue 的 `NewKeycloakProvider` 直接拼接配置的 Keycloak URL，不调用
`ValidateOAuthURL`/SSRF 校验，因此可以指向内网 HTTP/HTTPS。它在登录后调用 Keycloak
UserInfo，能拿到 `sub/name/email`。

## 本地验证状态（2026-10-24）

- Keycloak 26 本地 HTTPS `https://10.66.66.2:8443`，realm `learnos`
- Provider：Supabase `keycloak`，client `learnos-supabase`
- Broker：Keycloak OIDC IdP `floatctf`，指向本地 FloatCTF `https://10.66.66.2:9443`
- `pnpm test:e2e --grep FloatCTF` 的 11 个场景全部通过
- 首次登录成功创建 student，显示名 `testuser`；管理员密码登录不受影响

## 关键配置

Supabase：

```toml
[auth.external.keycloak]
enabled = true
client_id = "learnos-supabase"
secret = "env(SUPABASE_AUTH_EXTERNAL_KEYCLOAK_SECRET)"
redirect_uri = "http://127.0.0.1:54321/auth/v1/callback"
url = "https://10.66.66.2:8443/realms/learnos"
email_optional = true
```

`url` 在生产改为 Keycloak 的内网 HTTPS 地址。GoTrue 容器必须信任其 CA。

LearnOS：

- login/link 使用 `provider: "keycloak"`，并显式传 `scopes: "openid"`。
  GoTrue 的 Keycloak provider 默认只请求 `profile email`，缺 `openid` 会导致 Keycloak
  UserInfo 返回 403。
- 身份判定接受 `keycloak` 与旧 `custom:floatctf`（迁移期兼容）。
- profiles 触发器默认 student；准入 Hook 放行 `keycloak`。

Keycloak：

- Client `learnos-supabase`：confidential，redirect URI 为 Supabase callback。
- 关闭 client 的强制 PKCE（GoTrue Keycloak provider 不发送 challenge）。
- IdP `floatctf`：authorization/token/userinfo 指向 FloatCTF；scope `openid profile`。
- 首次 broker login 禁用 `Review Profile` 与 `VERIFY_PROFILE`，避免 Keycloak 强制
  填写 FloatCTF 不提供的邮箱/姓名。
- Broker 回调使用 HTTPS 内网地址；FloatCTF 客户端登记该 URI。

## 生产落地检查

1. 在 10.66.66.7 用持久化 PostgreSQL 运行 Keycloak（不要用 `start-dev` 的 H2）。
2. 用内部 CA 为 `10.66.66.7:8443` 签证书；把 CA 安装到 Supabase Auth 容器信任库。
3. Keycloak 仅监听内网，管理台不暴露。
4. 配置 realm/client/IdP；导入或脚本化，避免手工漂移。
5. 将 Supabase `url` 指向生产 Keycloak；`pnpm test:e2e` 跑 11 个 SSO 场景。
6. 回滚：把 `[auth.external.keycloak] enabled=false`，LearnOS 恢复密码登录；已有
   `auth.users.id`、profiles、学习记录不变。

## 已知注意点

- Keycloak 是新的关键单点，需要备份/健康检查/版本固定。
- 内网 HTTP 会明文传 token；生产必须 HTTPS + 内部 CA。
- Keycloak 首次登录流程必须测试；关闭 Review/VERIFY_PROFILE 后不会强制邮箱。
- `email_optional=true`；不要在 FloatCTF 侧请求未验证 email。
