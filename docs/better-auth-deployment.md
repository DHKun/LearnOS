# Better Auth + PostgreSQL 部署

## 组件

- Next.js Web（Docker `learnos-web`）
- PostgreSQL 17（`learnos-postgres`）
- Better Auth（邮箱密码 + FloatCTF genericOAuth）
- Drizzle（schema：`db/schema.sql` + `db/migrations/0000_*.sql`）

## 首次初始化

```bash
cp .env.example .env.local
# 必填：BETTER_AUTH_SECRET、BETTER_AUTH_URL、POSTGRES_PASSWORD
# FloatCTF：FLOATCTF_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET
docker compose up -d postgres
LEARNOS_DB_URL=postgresql://learnos:$POSTGRES_PASSWORD@127.0.0.1:5433/learnos pnpm db:migrate
LEARNOS_DB_URL=... pnpm courses:sync
LEARNOS_DB_URL=... ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm seed:admin
docker compose up -d web
```

`db/schema.sql` 与 Drizzle auth 迁移会由 Postgres 初始化卷自动执行；已有数据库只需 `pnpm db:migrate`。

## FloatCTF 内网 SSO

Web 容器必须信任 FloatCTF 的 HTTPS 证书：

```bash
LEARNOS_CA_FILE=/path/to/internal-ca.crt \
  docker compose -f docker-compose.yml -f docker-compose.sso.yml up -d web
```

FloatCTF 应用登记回调：

```
http(s)://<learnos-host>:3000/api/auth/callback/floatctf
```

禁止关闭 TLS 校验。浏览器访问的 issuer、Web 容器访问的 issuer 必须一致；内网 DNS/证书需同时可用。

## 验证

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
E2E_BASE_URL=http://127.0.0.1:3000 E2E_FLOATCTF_SSO=1 ... pnpm test:e2e
curl -f http://127.0.0.1:3000/api/health
```

本地已验证：Docker Web + 独立 Postgres 健康检查、管理员登录、FloatCTF SSO 进入 `/courses`。

## 回滚

- 保留上一镜像 `learnos-web:<previous>` 与 Postgres 卷备份。
- 应用回滚：`LEARNOS_IMAGE_TAG=<previous> docker compose up -d web`。
- 数据库迁移前做 `pg_dump`；不要删除唯一历史卷。
