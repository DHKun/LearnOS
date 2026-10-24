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

尚未切换：现有登录仍走 Supabase，避免半迁移状态破坏业务。服务层将按以下顺序迁移：

1. profiles/admin
2. courses/lessons
3. enrollments/progress
4. learning/blocks/notes
5. deployments
6. 删除 Supabase Auth/JS/PostgREST/RLS

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
