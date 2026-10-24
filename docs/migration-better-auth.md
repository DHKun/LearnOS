# Supabase → Better Auth + Drizzle + PostgreSQL 迁移

## Phase 0 审计（2026-10-24）

业务函数本身不依赖 `auth.uid()`：`join_course`、`complete_lesson`、`save_state`、
`save_note`、`save_block_result` 等全部接收 `p_student uuid`，并在
`learnos_assert_student` 内校验 profile 存在、未停用、role=student。唯一认证耦合是
RLS policies（16 条）与 `profiles.user_id → auth.users` 外键/触发器。

| 依赖 | 原位置 | 迁移目标 | 历史数据 | 测试 |
|---|---|---|---|---|
| Supabase Auth 会话 | `lib/supabase/server.ts`、`middleware.ts` | Better Auth session | 不迁移会话 | `tests/e2e/auth.spec.ts` |
| 登录/登出 | `lib/auth/actions.ts` | `auth.api.signInEmail/signOut` | — | login E2E |
| OIDC 登录/绑定 | `lib/auth/floatctf.ts`、`components/auth/*` | Better Auth genericOAuth `floatctf` | 不迁移身份 | SSO E2E |
| profiles/角色 | `lib/services/admin.ts`、`lib/auth/session.ts` | Drizzle `profiles` | 保留表结构，用户重新开始 | admin 权限测试 |
| 课程/章节 | `lib/services/courses.ts` | Drizzle SQL | 保留课程数据 | 课程 E2E |
| 报名/进度/积分 | `lib/services/enrollments.ts`、`learning.ts`、`points.ts` | Drizzle + 现有 SQL 函数 | 保留数据可迁移 | 并发/幂等测试 |
| 笔记/实验/测验 | `lib/services/notes.ts`、`blocks.ts` | Drizzle + 现有 SQL 函数 | 保留 | 越权测试 |
| 部署任务 | `lib/services/deployments.ts` | Drizzle | 保留 | 部署测试 |
| PostgREST/RPC | `createAdminClient().from/rpc` | `db.execute(sql)` / 事务函数 | — | 集成测试 |
| Storage | 未使用 | 无 | — | — |

## Phase 1（进行中）

已完成：

- `db/schema.sql`：从现有 public schema 导出，移除 RLS、`auth.users` 外键与 Supabase 角色授权；
- `learnos_v2` 独立库已创建并导入 courses/lessons（1 门课程、15 章节）；
- `lib/db/index.ts`：`pg.Pool` + Drizzle（连接池上限 10）；
- `lib/db/schema.ts`、`lib/db/auth-schema.ts`：Better Auth 的 user/session/account/verification（UUID）；
- `db/migrations/0000_*.sql`：Drizzle 迁移；
- `lib/auth/better.ts`：Better Auth + Drizzle adapter + genericOAuth `floatctf` + student profile hook；
- `app/api/auth/[...all]/route.ts`、`lib/auth/client.ts`。

已切换：登录、会话、API guard、middleware、全部 service 已使用 Better Auth + Drizzle。

1. profiles/admin — 完成
2. courses/lessons — 完成
3. enrollments/progress — 完成
4. learning/blocks/notes — 完成
5. deployments — 完成
6. 删除 Supabase Auth/JS/PostgREST/RLS — 运行时已无引用，测试/依赖清理待完成

## 关键决策

- 保留 UUID 用户 ID（Better Auth `advanced.database.generateId: "uuid"`）。
- 不迁移旧 Supabase Auth 用户；课程保留，用户/学习记录按用户要求全新开始。
- RLS 删除后，所有资源授权必须在 service/API 层逐资源校验；SQL 函数继续用
  `learnos_assert_student` 做数据库侧第二道校验。
- FloatCTF 使用 Better Auth `genericOAuth` + discovery + PKCE + 非ce；不用 Keycloak。

## 阻塞/风险

- Better Auth 与 Next.js 15 middleware（Edge）不能直接查 pg；middleware 只做 cookie
  存在性检查，真实鉴权在服务端 `auth.api.getSession` 完成。
- FloatCTF 回调需要 HTTPS（非 loopback）；生产需内网 CA，本地测试用 `127.0.0.1` 或
  `ignoreHTTPSErrors`。
- 旧 Supabase E2E/RLS 测试需改写为 Better Auth + 服务层授权测试。

## 已验证（本地，2026-10-24）

- Better Auth 邮箱密码登录：`/login` → `/admin`
- FloatCTF SSO：`/login` → FloatCTF → Better Auth callback → `/courses`
- 首次 SSO 登录自动创建 student profile（显示名来自 FloatCTF）
- 报名：`/courses/http-fundamentals` → 参加课程 → `/learn/<id>`
- `pnpm test`：25 文件 / 145 通过
- `pnpm typecheck`、`pnpm build`：通过
- `pnpm lint`：0 error，1 个既有 warning

## 待完成

- E2E 测试辅助仍使用 Supabase Admin 创建用户；需改为 Better Auth/pg 后重跑。
- 删除 `lib/supabase/`、`@supabase/*` 依赖、Supabase 迁移/部署配置与文档。
- 管理员建号/重置密码/禁用账号的 Better Auth E2E 验证。
- 独立 PostgreSQL 生产 compose、备份、连接池调优。

## 2026-10-24 全量 E2E

- 非 SSO：20/20
- FloatCTF SSO：11/11
- 合并全量：31/31（第二次运行；首次绑定用例曾受测试顺序影响，已复跑通过）
- 手动绑定修复：`account.accountLinking.trustedProviders = ["floatctf"]`，且 `allowDifferentEmails = true`；仅用于已登录用户的显式绑定。
- 首次登录仍创建独立 student；不使用邮箱自动合并。

## Phase 5 清理（2026-10-24）

- 删除 `lib/supabase/`、`scripts/oidc/`、Supabase 专用 perf 脚本。
- 运行时代码、课程同步/预检、seed 脚本不再引用 Supabase。
- `docker-compose.yml` 新增 `postgres:17`，挂载 `db/schema.sql` + Drizzle auth 迁移初始化。
- 本地 `docker compose up -d postgres` 验证：19 张表初始化成功。
- `@supabase/supabase-js` 仅保留为 devDependency，供尚未迁移的旧集成测试使用。
