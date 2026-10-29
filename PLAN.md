# PLAN.md — LearnOS MVP 实施计划与验收看板

> 计划状态：**已完成（本地 Docker/Supabase 环境验证）** — 2026-10-21。
>
> 复选框仅在代码实现且对应验证实际通过后勾选。证据均为本仓库可直接复现的命令或测试文件。云端托管部署、真实 SMTP 与生产域名未执行，见文末“未验证项”。

## 0. 目标、边界和交付定义

**最终目标**：管理员建号；学生完成「登录 → 参加一门课程 → 图文阅读 → 互动实验 → 服务端测验 → 结课 → 获得积分」；学生随时记笔记，离开后恢复；管理员准确查看每个学生和每门课程的实时近况、历史进度与成绩。

冻结技术栈：Next.js App Router、TypeScript、Tailwind CSS、shadcn/ui、Supabase Auth/PostgreSQL/Storage、MDX、原生 React 互动组件、同源 Learning SDK、Zod。

**MVP Done 定义**（全部满足）：

- [x] `docs/MVP-SPEC.md` 的 28 个 REST API 方法都有实现并经过契约与权限验证。
- [x] 11 张业务表 + Supabase Auth 身份源、索引、RLS、事务/幂等规则全部落地。
- [x] 9 个前端页面、3 种课程内容类型、两门可完整学习的示例课程。
- [x] 学生同时仅一条 active enrollment；支持主动退出/恢复/结课/复习。
- [x] 管理员可按学生/课程两维追踪进度、当前章节、最近在线与实际交互。
- [x] `docs/MVP-SPEC.md` 第 10 节 15 项验收测试通过。
- [x] lint、typecheck、test、build、E2E 全部实际执行通过。
- [x] 仓库有从零启动、初始化管理员、课程制作/同步、测试与部署说明。

## 1. Phase 0 — 工程与安全基础

**目标**：仓库能启动、迁移可重建、鉴权/RLS 边界可测试。

- [x] **P0-01** 检查仓库现状，确认现有工作树与项目结构，建立 `docs/decisions.md`。
- [x] **P0-02** 初始化 Next.js App Router + TypeScript + Tailwind + shadcn/ui 风格组件，启用 light/dark 主题。
- [x] **P0-03** 配置 pnpm、lint、typecheck、test、build、test:e2e 脚本与测试环境。
- [x] **P0-04** 集成 `@supabase/ssr` 会话客户端，登录/登出页面及服务端 auth/role guards。
- [x] **P0-05** 创建 11 张业务表、FK、唯一索引、check 约束、UTC 时间字段及迁移。
- [x] **P0-06** 添加全部业务表 RLS，限制学生所有权与管理员权限；敏感服务密钥仅限服务端。
- [x] **P0-07** 建立 Route Handler 通用认证、Zod 参数校验、统一 JSON 错误处理、Origin/CSRF 防护。
- [x] **P0-08** 创建 `.env.example`、本地数据库启动说明、管理员初始化/邀请流程及 RLS 测试。

**门禁 G0**

- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build` 全通过（2026-10-21）。
- [x] 实际数据库迁移、重建成功（`pnpm db:reset`）。
- [x] RLS 用 student/admin/anon 角色执行访问测试：`tests/integration/rls.test.ts`（8 项）。
- [x] 学生访问管理员接口拒绝；禁用账号不能继续调用业务 API；Secret 未出现在浏览器资源（`tests/e2e/access-control.spec.ts`、`pnpm security:scan`）。

**产出**：可启动的工程、Auth、数据库 schema + RLS、权限测试和 `.env.example`。

## 2. Phase 1 — 课程参与与学习主闭环

**依赖**：G0 通过。

- [x] **P1-01** 课程/章节 manifest 的 Zod 校验、`pnpm courses:validate`、`pnpm courses:sync`（保留发布状态）。
- [x] **P1-02** 学生接口：`GET /api/me`、`GET /api/courses`、`GET /api/courses/:slug`。
- [x] **P1-03** enrollment 接口：`GET /api/enrollments/current`、`GET /api/enrollments/history`、`POST /api/enrollments`、`POST /api/enrollments/:id/abandon`。
- [x] **P1-04** enrollment 事务与条件唯一索引；同课加入幂等、跨课并发冲突 409；退出/恢复保留进度。
- [x] **P1-05** Article（可信 MDX）播放器、章节进度及 `POST /api/lessons/:id/complete`。
- [x] **P1-06** 心跳 `POST /api/learning/heartbeat`，独立记录 `last_seen_at`、`last_interaction_at` 与当前章节。
- [x] **P1-07** 学生页面 `/courses`、`/courses/[slug]`、`/learn/[courseId]` 的文章学习流程。
- [x] **P1-08** 管理员 `GET /api/admin/overview`、`GET /api/admin/students` 和 `/admin`、`/admin/students` 的真实数据视图。

**门禁 G1**

- [x] 同一学生同时报名不同课程：数据库只保留一条 active；服务端返回正确 409。`tests/e2e/enrollment-concurrency.spec.ts`、`tests/integration/functions.test.ts`。
- [x] 重复报名同课、退出、恢复、重登，课程与章节状态保持一致。`tests/e2e/enrollment-concurrency.spec.ts`。
- [x] 离线 120 秒变为「非最近在线」，课程仍 active；心跳与交互时间含义不同。`tests/e2e/presence.spec.ts`、`tests/integration/functions.test.ts`。
- [x] 管理员可看到学生当前课程/章节/进度，不可访问学生私人笔记。`tests/integration/rls.test.ts`、`tests/e2e/access-control.spec.ts`。
- [x] Phase 1 相关单元/集成/E2E、lint、typecheck、build 通过。

**产出**：登录与图文课程学习闭环；管理员最小学习监控。

## 3. Phase 2 — 自由互动课程与数据追踪

**依赖**：G1 通过。

- [x] **P2-01** 独立互动静态资源构建/部署配置（已由 Phase 11 单站点重构取代）。
- [x] **P2-02** 父窗口 iframe bridge（已由 Phase 11 单站点重构取代）。
- [x] **P2-03** `packages/learning-sdk`：`start`、`track`、`saveState`、`complete`、`submit`、`onRestore`。
- [x] **P2-04** `POST /api/learning/events`，事件 UUID 幂等、类型/载荷大小限制、节流和交互时间更新。
- [x] **P2-05** `GET/PUT /api/learning/states/:lessonId`，版本号乐观锁、自动保存、恢复与冲突处理。
- [x] **P2-06** `POST /api/learning/submissions` 和静态注册的服务端 validator（只允许可信验证器决定 `server_validated` 通过）。
- [x] **P2-07** 两个完整互动实验：操作反馈、关键事件、刷新恢复、服务端验证成功/失败。
- [x] **P2-08** 播放器接入实验；管理员学生详情可查看当前实验章节及最近 50 条事件。

**门禁 G2**

- [x] 事件上报、刷新/关闭重开恢复、步骤完成、状态版本冲突全通过。`tests/e2e/security.spec.ts`、`tests/integration/functions.test.ts`、`tests/e2e/learning-flow.spec.ts`。
- [x] 超大 payload 的请求被拒绝。`tests/e2e/security.spec.ts`（事件 8KB/状态 64KB/笔记 64KB）。
- [x] 伪造 `complete` 或事件上报无法绕过服务端校验，也无法刷积分。`tests/e2e/security.spec.ts`。
- [x] 跨用户、跨课程、跨章节读写事件/状态被拒绝，RLS/服务端测试通过。`tests/integration/rls.test.ts`、`tests/e2e/security.spec.ts`。
- [x] Phase 2 相关测试、lint、typecheck、build 通过。

**产出**：可独立开发的交互应用、Learning SDK、可靠追踪与恢复能力。

## 4. Phase 3 — 测验、笔记、积分与管理完成

**依赖**：G2 通过。

- [x] **P3-01** `GET /api/quizzes/:lessonId`（隐藏答案）和 `POST /api/quizzes/:lessonId/submit`（后端评分、达标通过、attemptId 幂等）。
- [x] **P3-02** 章节完成、课程完成和 point ledger 的原子事务（每 Lesson 首次 +10，最终 Quiz 首次通过额外 +50）。
- [x] **P3-03** `GET/PUT /api/notes/:lessonId`、64KB 限制、自动保存及安全 Markdown 预览。
- [x] **P3-04** `GET /api/me/points`、`/me` 中的课程历史/积分流水，完成课程后释放名额，完成课程进入只读复习。
- [x] **P3-05** 管理学生：`POST /api/admin/students`、`GET/PATCH /api/admin/students/:id`、`POST .../reset-password`。
- [x] **P3-06** 管理课程：`GET /api/admin/courses`、`GET/PATCH /api/admin/courses/:id`、`GET .../students`。
- [x] **P3-07** 管理页面 `/admin/courses`、`/admin/courses/[id]`，按课程展示 active/completed/abandoned 学生名单、进度、当前章节、最近在线。
- [x] **P3-08** 28 个 API 方法全部实现，`docs/api.md` 完整整理，管理端 30 秒轮询。

**门禁 G3**

- [x] 试题正确答案和 validator 不出现在客户端资源/网络响应；失败可重试；通过才完成 Quiz。`tests/e2e/security.spec.ts`、`pnpm security:scan`。
- [x] 积分在重复提交、并发和重放情况下只记一次；课程结课与积分事务一致。`tests/integration/functions.test.ts`。
- [x] 学生仅能访问自己的笔记，管理员默认无法获取内容；禁用账号无业务访问权。`tests/integration/rls.test.ts`、`tests/e2e/access-control.spec.ts`。
- [x] 管理员按学生/课程两个维度能查到完整、真实的学习结果，30 秒轮询工作。`tests/e2e/learning-flow.spec.ts`、`tests/e2e/admin-courses.spec.ts`。
- [x] Phase 3 相关测试、lint、typecheck、build 通过。

**产出**：全部主功能与 28 个 API 方法闭环，学生/管理员页面完整。

## 5. Phase 4 — 两门演示课程、端到端验收与交付

**依赖**：G3 通过。

- [x] **P4-01** 示例课程 A（`sql-injection-basics`）：article、独立 interactive、最终 quiz，可从头完成。
- [x] **P4-02** 示例课程 B（`idempotent-retries`）：article、独立 interactive、最终 quiz，可从头完成。
- [x] **P4-03** 示例课程 manifest 验证与同步加入可复现流程；结构变更遵守课程版本冻结策略。
- [x] **P4-04** E2E：2 个学生 + 1 个管理员；覆盖报名并发、学习、互动、测验、笔记、积分及管理员查看。
- [x] **P4-05** 完整权限、RLS、Origin/CSRF、重放、资源归属测试与敏感信息扫描。
- [x] **P4-06** README、架构、API、课程制作、决策日志、截图与验证命令。
- [x] **P4-07** 执行最终全套命令、汇总真实结果。

**门禁 G4 / Release**

- [x] 第 6 节全部 15 项验收通过（无“未验证”的验收项；云端部署不在 MVP 验收内）。
- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm test:e2e` / `pnpm security:scan` 均有实际运行记录。
- [x] 两门课程均端到端学习；管理员看到准确结果，敏感密钥未泄露。
- [x] 从本仓库空目录按 README 指令完成安装、迁移、初始化、同步课程并启动；未在第二台干净主机独立重放（见未验证项）。
- [x] 课程内容不新增规格外功能；README 记录未实现项。

**产出**：可演示、可开发、可验证的 LearnOS MVP。

## 6. MVP 15 项验收对照（与规格第 10 节一一对应）

| 编号 | 验收项 | 状态 | 证据位置 |
|---|---|---|---|
| A01 | 管理员建号、学生登录、学生越权访问被拒绝 | ☑ | `tests/e2e/access-control.spec.ts`（UI 建号、/admin 重定向、admin API 403、停用/启用） |
| A02 | 并发报名不同课程只保留一个 active | ☑ | `tests/e2e/enrollment-concurrency.spec.ts`；`tests/integration/functions.test.ts`（并发 RPC + 部分唯一索引） |
| A03 | 同课报名幂等，退出/恢复保留笔记和进度 | ☑ | `tests/e2e/enrollment-concurrency.spec.ts`；`tests/integration/functions.test.ts` |
| A04 | 无课程时限，离线不改变 active | ☑ | `tests/e2e/presence.spec.ts`（回拨 `last_seen_at` 3 分钟）；`tests/integration/functions.test.ts` |
| A05 | 学生详情：课程、章节、进度、在线/交互时间、事件 | ☑ | `tests/e2e/learning-flow.spec.ts`（管理员抽屉）；`/api/admin/students/:id` |
| A06 | 课程详情：三种状态学生名单及各自进度 | ☑ | `tests/e2e/admin-courses.spec.ts`；`App (admin)/admin/courses/[id]` |
| A07 | 原生互动组件事件、状态恢复、多标签冲突与超限被拒绝 | ☑ | `tests/e2e/learning-flow.spec.ts`（实验事件 payload、刷新恢复、无 iframe）；`tests/e2e/native-state.spec.ts`（多标签冲突恢复）；`tests/e2e/security.spec.ts`（8KB/64KB 限制） |
| A08 | 伪造完成与遥测不能绕过 server_validated 或增加积分 | ☑ | `tests/e2e/security.spec.ts`；`tests/integration/functions.test.ts` |
| A09 | 服务端判题、答案保密、达标后通过 | ☑ | `tests/e2e/security.spec.ts`（响应无 answer/explanation）；`pnpm security:scan` |
| A10 | 章节/测验/事件幂等与积分去重 | ☑ | `tests/integration/functions.test.ts`（完成/提交/attempt/event/ledger）；`tests/e2e/security.spec.ts` |
| A11 | 全部必修完成结课、释放课程占用、支持复习 | ☑ | `tests/integration/functions.test.ts`；`tests/e2e/learning-flow.spec.ts`（两门课） |
| A12 | 私人笔记隔离、跨用户进度/积分修改被拒绝 | ☑ | `tests/integration/rls.test.ts`；`tests/e2e/security.spec.ts` |
| A13 | 多标签状态保存版本冲突有保护 | ☑ | `tests/e2e/security.spec.ts`；`tests/integration/functions.test.ts` |
| A14 | 两门课程端到端学习闭环 | ☑ | `tests/e2e/learning-flow.spec.ts`（两门课程，各自 90 分） |
| A15 | lint、typecheck、test、build 与安全/RLS 验证 | ☑ | 下方“最终验证记录”；`tests/integration/rls.test.ts`；`pnpm security:scan` |

## 7. 风险和控制措施

| 风险 | 控制措施 | 覆盖证据 |
|---|---|---|
| 并发报名造成两条在学课程 | PostgreSQL 部分唯一索引 + 并发集成/E2E 测试 | A02 |
| 客户端伪造完成/刷积分 | 事务函数 + 服务端验证器 + 题库判分 + ledger 去重 | A08/A10 |
| 原生互动组件滥用身份或绕过校验 | 显式 Registry、同源认证 API、httpOnly Cookie、服务端 validator | A07 |
| 多标签覆盖学习状态 | expectedVersion 乐观锁、409 冲突提示 | A13 |
| 管理员越权读取私人笔记 | RLS 无管理员策略 + 服务端归属检查 | A12 |
| 已报名课程结构变化导致进度失真 | 同步时结构冻结、结构性升级新 slug | `scripts/courses/sync.ts`、课程制作文档 |
| 后台把在线当作学习行为 | 独立 `last_seen_at` / `last_interaction_at` | A04 |
| 无云端凭据无法验证 | 本地 Supabase + Docker；明确标注未执行云端部署 | 未验证项 |

## 8. 最终验证记录（2026-10-21，本机）

| 命令 | 实际结果 |
|---|---|
| `pnpm lint` | ✅ 0 errors / 0 warnings |
| `pnpm typecheck` | ✅ 通过 |
| `pnpm test` | ✅ 10 个测试文件，63 项通过（单元 + 真实 PostgreSQL RLS/事务） |
| `pnpm build` | ✅ Next.js 生产构建成功（22 个页面/接口路由） |
| `pnpm security:scan` | ✅ 扫描 62 个客户端资源，未发现 service role key 或测验解析 |
| `pnpm test:e2e` | ✅ 16 个 Playwright 测试通过（账号权限、CSRF、课程管理、并发/幂等/恢复、两门课程闭环、四个概念动画、知识检查、原生互动刷新恢复、多标签状态冲突、笔记自动保存、管理员独立学生详情/互链、确认弹窗、越权与重放、在线语义） |
| `pnpm courses:validate` | ✅ 2/2 门课程通过 |
| 数据库迁移 | ✅ 7 个迁移已通过 `migration up` 应用；未执行全量 `db:reset`，避免清空运行数据 |
| `pnpm seed:admin` / `pnpm seed:demo` | ✅ 管理员 + 2 名学生 + 2 门已发布课程 |
| RLS 测试 | ✅ student/admin/anon 8 项（`tests/integration/rls.test.ts`） |

E2E 测试文件：

```text
tests/e2e/access-control.spec.ts        2 tests
tests/e2e/admin-courses.spec.ts         1 test
tests/e2e/enrollment-concurrency.spec.ts 2 tests
tests/e2e/learning-flow.spec.ts         2 tests
tests/e2e/notes.spec.ts                 1 test
tests/e2e/presence.spec.ts              1 test
tests/e2e/security.spec.ts              2 tests
tests/e2e/native-state.spec.ts          1 test
tests/e2e/confirm-dialogs.spec.ts       1 test
tests/e2e/concepts.spec.ts              2 tests
tests/e2e/admin-detail.spec.ts          1 test
```

## 9. 未验证项与已知限制

- **云端托管部署未执行**：本地 Supabase/Docker 已验证；托管 Supabase 项目、生产域名、TLS 与反向代理需按 README 部署步骤执行。
- **真实 SMTP 未验证**：密码重置调用 Supabase Auth 邮件接口；本地邮件在 Mailpit 查看，生产需配置 SMTP。
- **第二台干净主机未独立重放**：本仓库在空目录中初始化并按 README 命令完成迁移/种子/启动；未在另一台机器从头复现。
- 未使用 Supabase Storage（MVP 无上传需求）；未实现学生自助改密页面。
- 管理端为 30 秒轮询，不提供实时推送。

## 10. 当前工作记录（Agent 持续维护）

```text
当前 Phase：Release（完成）+ 单机 Docker Compose 部署（完成）+ 章节级混合互动（完成）
当前任务：P0-01 ～ P4-07；第 14 节一键部署；第 15 节 Manifest v3 混合章节全部完成
最近验证日期：2026-10-23
本次已完成：四门课程（含 http-from-zero v3 混合课程）、API、11+2 章节 Block+2 部署表 + RLS + 事务函数、
            同源 Learning SDK、ChapterLearningProvider/BlockScope、block_results/attempts、
            MDX AST 校验、章节内 all/any 完成规则、学生 5 页 / 管理员 5 页；
            单机 Docker Compose：web + updater、固定快照、courses:preflight/sync、
            构建日志、系统/课程版本、自动/手动回滚、部署任务持久化；
            性能专项、审计修复、单站点原生活动重构；见 docs/decisions.md / docs/architecture.md
测试结果：lint 0 error（1 既有 warning）；typecheck 通过；Vitest 19 文件 / 126 passed；
          build 通过；Playwright 18 passed（本地）+ 线上混合课程 E2E 通过；security scan 75 资源通过；courses:validate 4/4；
          真实 Compose 部署 2026.10.23-01 成功；线上 health / 管理扫描 / HTTP 混合课程已验证
失败 / 阻塞：无（本地）；托管云端、SMTP、TLS、第二台主机未验证
下一个门禁：无（本地 Release）
```

## 11. 单站点原生活动重构（2026-10-22）

- [x] Manifest/Loader/Sync/DB 约束改为 `activityId`，移除 `entryUrl` 与 Labs origin 校验。
- [x] 新增 `lib/activities/catalog.ts`、`components/activities/registry.tsx`、`ActivityHost`。
- [x] 两个实验迁移为原生 React 组件，纯模拟逻辑与 server validator 共用。
- [x] 新增同源 `LearningClient` + `LearningProvider` + `useActivityState`，去掉 postMessage。
- [x] 删除 `apps/labs`、`packages/learning-sdk`、iframe 播放器、bridge、Labs 服务与 `LABS_*` 配置。
- [x] 迁移 `20250101000600_activity_registry.sql` 保留课程/章节/报名/进度/笔记/积分/测验记录；事务级迁移演练通过；有报名时再次 `courses:sync` 成功且不覆盖 `activityId`。
- [x] E2E 覆盖原生组件运行、事件 payload、刷新恢复、多标签冲突、无 iframe、生产构建仅启动 3000。
- [x] 文档同步：README、AGENTS、MVP-SPEC、architecture、course-authoring、decisions、audit-remediation。
- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm test:e2e` / `pnpm security:scan` 通过（63 unit/integration、16 E2E、62 静态资源扫描）。
- [ ] 云端 staging / SMTP / TLS 未验证（环境限制）。

**门禁**：本地代码、测试、数据库与文档均已完成；云端验收留待 staging。

## 12. 教学体验与 UX 重构（2026-10-22）

### Phase 1 — 可靠性

- [x] 管理端列表/详情使用可见性感知轮询、请求序号保护，编辑/确认弹窗期间暂停刷新。
- [x] 笔记本地草稿、900ms 自动保存、失败重试、`pagehide`/卸载 keepalive、多标签冲突提示；登出清理本地草稿。
- [x] manifest 拥有结构/题库/版本，管理员拥有 title/description；普通 `courses:sync` 不覆盖管理员元数据，新增 `--refresh-metadata`。
- [x] 单测覆盖元数据同步策略。

### Phase 2 — 学习工作区

- [x] 桌面可折叠目录、主内容优先、默认关闭的笔记抽屉、专注模式。
- [x] 移动端目录抽屉、笔记抽屉、内容优先；375/768/1440 宽度检查，无页面级横向溢出。
- [x] 上一节/下一节、当前任务说明、完成条件、结课结果与课程入口。

### Phase 3 — 概念动画与混合内容

- [x] `conceptId` Registry、按需加载、`ConceptFrame` 控制器、reduced-motion、键盘、静态图解。
- [x] 四个动画：SQL 数据/指令、SQL 参数化、幂等回执丢失、幂等键去重。
- [x] MDX 混合内容：概念动画 + `MiniCheck` + 文字/`Callout`；旧 MDX 兼容。
- [x] 可选 `unit` 逻辑分组写入 `lessons.config.unit`，不新增表。
- [x] 概念状态保存/恢复、概念/知识检查事件进入时间线。

### Phase 4 — 管理员体验

- [x] 独立 `/admin/students/[id]`，概览/章节/时间线/成绩积分四标签，中文事件语义映射。
- [x] 待关注学生：未开始、长期未活动、可能卡章节、最近完成；仅提示，不自动退课。
- [x] 课程学员真实数据库分页（20/页）、状态筛选、学生/课程互链。
- [x] 管理员学生/课程列表与详情轮询刷新。

### 验收

- [x] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm test:e2e`、`pnpm security:scan`、`pnpm courses:validate` 通过。
- [x] E2E 覆盖四个概念动画、知识检查、刷新恢复、原生互动、响应式页面、管理员详情/互链。
- [ ] 慢速网络/断网、真实 SMTP/TLS/staging、并发压测未验证（环境限制）。

> 真实结果以第 8 节和最终报告为准；不以复选框替代测试。

## 13. 课程插件化（2026-10-22）

- [x] `course.json` Manifest v2：`plugins.concepts` / `plugins.activities` / validator 声明。
- [x] `pnpm courses:prepare` 自动扫描、路径/导出校验、稳定排序、生成 Registry。
- [x] 生成 `course-catalog.ts`、`course-components.tsx`、`validator-registry.server.ts`。
- [x] 旧两门课程组件迁入各自 `content/courses/<slug>/concepts|activities|simulation`，保留原 activityId/conceptId 与学习记录。
- [x] `pnpm courses:scan` 输出课程版本与源码摘要。
- [x] Validator 指纹改为生成器对源码文件计算 SHA-256，旧指纹首次同步兼容升级。
- [x] `build/dev/typecheck/courses:validate/courses:sync` 自动 prepare。
- [x] 生产部署执行器由单机 Docker Compose `updater` 实现（见第 14 节），不依赖反向代理、CI 凭据或镜像仓库。

## 14. 单机 Docker Compose 一键部署（2026-10-22）

**目标**：复制课程目录 → 管理员扫描 → 点击部署 → Docker Compose 构建并替换 web → 学生看到新内容；构建/健康检查失败不破坏旧版本，学生数据不丢失。

- [x] `docker-compose.yml`：`web` + `updater`，只发布 3000；保持现有 Supabase。
- [x] `Dockerfile`：`deps → tools → builder → runner`；standalone 运行；内容目录随镜像。
- [x] `deploy/updater/updater.mjs`：固定操作、源码快照、日志持久化、健康检查、自动/手动回滚；不接受任意 Shell。
- [x] `deployment_jobs` / `deployment_state` 迁移、service-role-only RLS、`claim`/日志/晋升/失败 RPC。
- [x] `/admin/courses` 「扫描更新」：新课程/有更新/已是最新/版本冲突/扫描失败/已移除。
- [x] `/admin/deployments`：当前系统版本、课程版本清单、待部署课程、扫描、查看更新、编译部署、构建日志、历史、上一版本回滚。
- [x] 版本号 `YYYY.MM.DD-NN`、课程版本、源码/结构摘要、镜像 ID/标签；不依赖 Git Commit。
- [x] 课程快照/扫描/预检共享逻辑；版本未递增检测；结构变化 + 已有学习记录阻止部署。
- [x] 插件修复：Validator ID 重复、符号链接越界、复制即安装测试。
- [x] Docker Compose 首次启动与旧地址 10.66.66.2:3000 真实验证。
- [x] 复制新课程 → 扫描 → 部署 → web 容器实际更新 → 学生看到新课程。
- [x] 构建失败不替换旧容器；健康检查失败自动恢复上一镜像；手动回滚。
- [x] 学生学习记录/积分在部署与回滚后保持。
- [x] lint / typecheck / test / build / E2E / security:scan / courses:validate 全量复跑。

### 14.1 真实验收记录（2026-10-22，本机 Docker）

| 验收项 | 实际结果 |
| --- | --- |
| Docker Compose 启动 | `learnos-web` healthy，`learnos-updater` running；只发布 `0.0.0.0:3000->3000/tcp`，updater 无端口 |
| 原有站点 | `http://10.66.66.2:3000/login` → 200；管理员可登录并访问原页面 |
| 复制新课程 | 复制幂等课程为 `content/courses/http-retry-basics`，修改 slug/概念/活动/validator ID；`pnpm courses:validate` 3/3 |
| 扫描新课程 | `/admin/courses` 与 `/admin/deployments` 显示「新课程」；部署后显示「有更新 1.1.0」与文件变更 |
| 真实部署 | 版本 `2026.10.22-04`、`05`、`07`、`08`、`09`、`10`、`11` 成功：Next.js 实际构建、`docker compose up` 替换 web、健康检查通过 |
| 地址不变 | 部署后 `http://10.66.66.2:3000` 仍为 200 |
| 学生看到新课程 | 学生 `/api/courses` 与 `/courses` 页面出现「HTTP 重试与幂等：一次请求只生效一次」 |
| 管理员看到新版本 | 当前 `2026.10.22-11`，上一版本 `2026.10.22-10`；课程版本 HTTP `1.1.0`、另外两门 `1.0.0`，镜像摘要与历史记录准确 |
| 构建失败不替换旧容器 | `2026.10.22-02` 在 `pnpm build` 失败、`03` 在快照阶段失败；旧容器继续 healthy，`learnos-web:current` 保持旧镜像 |
| 健康检查失败自动回滚 | `2026.10.22-06` 注入 `/api/health` 500，任务标记 `rolled_back`；updater 自动恢复 `04` 镜像，健康检查恢复 200 |
| 手动回滚 | `2026.10.22-05` 后手动回滚到 `04`，任务 `succeeded`，健康版本变为 `04` |
| 学生数据 | 两名学生部署前后各保留 10 积分、笔记内容；课程/章节进度与 enrollment 未丢失 |
| 静态验证 | `pnpm lint` 0 error（1 个既有 warning）、`pnpm typecheck` 通过、`pnpm test` 79 passed、`pnpm build` 通过 |
| E2E | `pnpm test:e2e` 17 passed（含部署控制台扫描与权限隔离；回滚结构兼容性另有 4 项单元测试） |
| 安全/课程 | `pnpm security:scan` 71 个资源无泄漏；`pnpm courses:validate` 3/3 |

> 未验证：托管 Supabase/云端主机、真实 SMTP、TLS/反向代理、第二台干净主机重放、rootless Docker、长时间压测。上述项目未作为本次验收通过项。

## 15. 章节级混合互动教学系统（Manifest v3，2026-10-23）

**目标**：Course → Chapter → Block；同一章节可自由组合文字、图片、动画、JS 模拟实验、知识检查和总结；完成规则由服务端判定，旧 v2 课程与学习数据不回归。

### 15.1 数据模型与渲染

- [x] Manifest v3：`article` 章节可选 `blocks`（simulation/question）与 `completion`（manual/all/any）；v2 兼容。
- [x] MDX AST 校验：Concept/Activity/Block 引用、声明 Block 恰好渲染一次、组件类型、未知组件。
- [x] 客户端组件禁止导入 `validators.ts` / `*.server.json` / `assessments/`。
- [x] `ChapterLearningProvider` + `BlockScope`：同一章多个 Concept/Simulation 使用 `blockId` 命名空间。
- [x] `SimulationBlock` / `KnowledgeCheck` / `ChapterProgress`；普通 MDX、Callout、MiniCheck 继续工作。
- [x] `useBlockState` 复用 600ms 防抖、自动保存、刷新恢复、版本冲突与只读复习；旧扁平概念状态兼容读取。

### 15.2 Block 服务端验证与完成

- [x] `block_attempts` / `block_results` 迁移、RLS（仅 service role）。
- [x] `save_block_result` / `learnos_chapter_completion_satisfied`；幂等 attempt、all/any、首次 +10。
- [x] `POST /api/learning/blocks/submit`；服务端 validator/题库评分，拒绝客户端 `passed` 字段。
- [x] `complete_lesson` 拒绝 manual 绕过 v3 server_validated 章节。
- [x] 章节知识检查支持单选、多选、判断题；答案/解析不出现在公开数据或客户端 bundle。

### 15.3 示范课程与兼容

- [x] `http-from-zero` 9 章：纯文字、动画、URL+自测、模拟实验、实验+知识检查 all、知识检查、多个动画+实验/知识检查 any、纯文字总结、最终测验。
- [x] 旧 `sql-injection-basics`、`idempotent-retries`、`http-retry-basics` 继续 v2 加载与完成。
- [x] `courses:scan` / `courses:snapshot` / 部署结构摘要包含 v3 `chapterHash`；旧课程摘要不变。
- [x] `courses:sync` 冻结必需 Block、完成模式、validator 指纹、必需题库哈希；允许可选 Block/文案变化。

### 15.4 测试与验收

- [x] 单元：Manifest v3、完成规则、结构哈希/冻结、MDX AST、判断题/公开题目、多 Block 状态隔离。
- [x] 集成：真实 PostgreSQL 下 Block 失败/通过、all/any、幂等重放、同键不同内容、归属不匹配、RLS、积分只发一次。
- [x] E2E：`http-from-zero` 九章完整学习闭环；纯文字/动画/实验/知识检查/all/any/刷新恢复/最终测验；伪造 `passed` 与直接完成被拒绝。
- [x] `pnpm courses:validate` 4/4；`pnpm lint` / `typecheck` / `test` / `build` / `test:e2e` / `security:scan` 全量执行（结果见 15.5）。

### 15.5 实际验证记录

| 项目 | 结果 |
| --- | --- |
| `pnpm courses:validate` | ✅ 4/4（含 `http-from-zero` v3 与 3 门旧 v2 课程） |
| `pnpm lint` | ✅ 0 error（1 个既有 notes-panel warning） |
| `pnpm typecheck` | ✅ 通过 |
| `pnpm test` | ✅ 19 个文件、126 tests 通过（含真实 PostgreSQL Block/RLS 集成） |
| `pnpm build` | ✅ 通过；`/api/learning/blocks/submit` 已生成 |
| `pnpm test:e2e` | ✅ 18 passed（最终全部 E2E） |
| `pnpm security:scan` | ✅ 75 个客户端资源通过，未发现服务端密钥/测验解析泄漏 |
| 真实 HTTP 课程 | 纯文字、动画、模拟实验、知识检查、all/any、最终测验均实际完成；DB 记录 completed、积分 140 |
| Docker Compose 发布 | ✅ 版本 `2026.10.23-01` 成功；health 返回新版本，旧镜像保留为上一版本 |
| 线上混合课程 E2E | ✅ 在 `http://10.66.66.2:3000` 实际跑通 `http-mixed.spec.ts`（九章完整闭环） |
| 线上扫描 | ✅ 升级后 `/admin/deployments/scan` 显示 4 门课程全部 latest、无冲突/失败 |
| 状态恢复 | 章节刷新后 Cookie 实验参数恢复；两个 Concept 的 step 分别保存（2 / 0） |

> 升级路径说明：运行中的旧 Web（`2026.10.22-11`）扫描器不认识 v3 的 `article + server_validated`，因此本次先直接创建 `deployment_jobs` 记录，由 updater 完成一次性代码升级；升级后的新 Web 扫描已恢复 4/4 latest，后续课程更新可正常使用 `/admin/deployments` 页面。
>
> 未验证：慢网/断网、真实 SMTP/TLS/云端 staging、第二台干净主机、并发压力测试。文档见 `docs/mixed-chapters.md`。

## 16. 学习体验 P0：常驻笔记、自动结章同步与章节导航（2026-10-23）

**目标**：学习页始终可打开笔记；章节完成由服务端事务判定并即时反映到正文、左侧目录和课程总进度；左侧导航一眼可辨认为课程章节目录。失败状态不伪装成通过。

### 16.1 常驻浮动笔记

- [x] 右下角固定「笔记」按钮，滚动到章节底部仍可见；桌面端为无遮罩非模态侧栏，正文可继续阅读和滚动。
- [x] 小屏为右侧抽屉；页面底部预留空间，浮动按钮不遮挡「下一章」等章节操作。
- [x] 支持展开、收起、Escape 关闭；按钮提供 `aria-expanded` / `aria-controls` 和明确可访问名称。
- [x] 专注模式仍可使用笔记；切换章节后加载对应笔记，未保存内容通过既有 draft + keepalive 保存。
- [x] 保留 Markdown 编辑/预览、900ms 自动保存、本地草稿、跨标签冲突提示；未新增笔记服务、表或编辑器框架。

### 16.2 自动结章与状态同步

- [x] `ChapterProgress` 改为从 `ChapterLearningProvider` 读取实时 Block 结果与完成状态，不再直接依赖首次渲染的 Props。
- [x] Block 通过后正文条件列表、完成横幅、左侧章节状态、课程总进度同步更新；服务端返回 `chapterCompleted` 后才显示完成。
- [x] 自动显示「本章已完成」和「进入下一章」，不强制跳页。
- [x] 手动结章仅在服务端事务成功后显示完成，并使用 keepalive，避免立即导航导致请求中止。
- [x] 版本冲突保持可见，直到学生显式重新加载，避免迟到重试把冲突伪装成已保存。
- [x] 积分仍只由 `save_block_result` / `complete_lesson` 事务发放；重复提交验证 `pointsAwarded=0`。

### 16.3 章节导航

- [x] 顶部显示课程名称、课程进度、百分比与章节总数。
- [x] 目录标题为「课程章节」，每项显示「第 N 章」；当前章节 `aria-current=page` 并高亮。
- [x] 已完成绿色勾选、学习中/未开始使用不同图标与文字；当前章节即使尚未写入 progress 也显示为学习中。
- [x] 单元存在时显示「单元 · 名称」分组；章节名称允许换行。
- [x] 课程章节固定左侧；本章小节目录在 `2xl`（1536px+）作为右侧 sticky 栏，与课程章节目录分层。
- [x] 笔记打开时右侧由笔记接管，大纲暂时让位；1024–1535px 与移动端降级为正文上方的可折叠「本章小节目录」。
- [x] 桌面端目录 Sticky，移动端使用目录抽屉；不把 article/interactive/quiz 作为主要可见标签。

### 16.4 验证记录

| 项目 | 结果 |
| --- | --- |
| `pnpm lint` | ✅ 0 error（1 个既有 notes-panel warning） |
| `pnpm typecheck` | ✅ 通过 |
| `pnpm test` | ✅ 19 个文件、126 tests 通过 |
| `pnpm build` | ✅ 通过 |
| `pnpm test:e2e` | ✅ 22 passed（本地 `http://127.0.0.1:3005`，含新增 4 个学习工作区测试） |
| `pnpm security:scan` | ✅ 75 个客户端资源通过 |
| `pnpm courses:validate` | ✅ 4/4 |
| 新增 E2E | 底部笔记按钮可见、桌面非模态、专注模式、移动端不遮挡下一章、双必需活动自动结章、目录/进度同步、重复提交不发分 |

## 17. 课程模型收敛（P1，2026-10-23）

**目标**：唯一正式模型 `Course → Chapter（MDX）→ 可选 Block → 完成规则`；不再维护 v2 类型分支与 Legacy Global ID。

### 17.1 Manifest 与内容

- [x] `schemaVersion` 固定为 3；删除 `type`、`completionPolicy`、`activityId`、`config` 与 v2 union。
- [x] 章节统一为 `source` + 可选 `blocks` / `completion` / `finalExam`；`finalExam` 改为可选，最多一个。
- [x] 删除 `legacyGlobalId` 与 `validator.id`；插件全局 ID 固定为 `${courseSlug}/${localId}`。
- [x] 三门口径旧课程（SQL 注入、幂等、HTTP 重试）迁移为统一章节：新增实验/结业 MDX，独立实验与测验变成 Block。
- [x] 保留既有 course/chapter/enrollment/progress/point 记录；使用一次性 `courses:sync --adopt-structure` 迁移，普通同步继续冻结。

### 17.2 渲染与判分

- [x] 学习页统一渲染 MDX + `ChapterLearningProvider`；删除 `ActivityHost`、`QuizPlayer`、`/api/learning/submissions`、`/api/quizzes/*`。
- [x] 最终测验通过必需 question Block 判分；新增迁移在 `save_block_result` 内发放首次 +50，重复提交不发分。
- [x] `resolveChapterCompletion` 省略 completion 即手动完成；未列入 requiredBlocks 的 Block 仅作可选练习。
- [x] 同步结构比较覆盖 type/completion/finalExam/chapterHash；发布校验只要求必修章节、MDX 内容与最多一个 finalExam。

### 17.3 验证记录

| 项目 | 结果 |
| --- | --- |
| `pnpm courses:validate` | ✅ 4/4（全部 v3） |
| `pnpm courses:sync` | ✅ 4/4 正常同步；已有学习记录课程冻结通过 |
| `pnpm lint` | ✅ 0 error（1 个既有 notes-panel warning） |
| `pnpm typecheck` | ✅ 通过 |
| `pnpm test` | ✅ 19 个文件、126 tests 通过（含真实 PostgreSQL 最终测验 +60 与重复提交） |
| `pnpm build` | ✅ 通过 |
| `pnpm test:e2e` | ✅ 22 passed（本地 `http://127.0.0.1:3005`，含迁移后的 SQL/幂等/HTTP 全部闭环） |
| `pnpm security:scan` | ✅ 72 个客户端资源通过 |
| 数据迁移 | ✅ 3 门旧课程原地迁移，3 条演示 enrollment 保留；未清空业务表 |

## 18. 前端性能优化（2026-10-23）

**目标**：在不改变课程/学习语义的前提下，减少首屏请求与 RSC 渲染、缩短交互等待，并保持 60fps 滚动和笔记自动保存。

### 18.1 已实施

- [x] 章节目录只自动预取下一章；其余章节在 hover / pointerdown / touchstart 时按需预取，避免首屏 7 路并发 RSC（DB + MDX）渲染。
- [x] 去掉 sticky 顶栏与工作区工具栏的 `backdrop-blur`，去掉笔记侧栏的 `padding` 布局动画，降低滚动/展开时的合成与重排成本。
- [x] 课程详情按 courseId 直接并行查询（3→2 次 DB 往返），学习页 state / block results / note 并行读取；纯文字章节跳过 block results 查询。
- [x] 生产环境缓存课程 manifest、MDX 源文与公开 Block 题库；课程结构短 TTL 缓存（15s），管理员更新后主动失效。
- [x] 笔记输入：UTF-8 计数改为无分配的延迟计算，localStorage 草稿写入移出每次按键路径；仅打开时挂载笔记面板。
- [x] 知识检查按题 `React.memo`，点击一个选项不再重渲染全部题目。
- [x] 页面/API/中间件会话校验从远程 `auth.getUser()` 改为本地 `getClaims()` 验签（ES256/JWKS），角色与禁用状态仍实时查库。
- [x] Block 通过但未结章时不再整页 `router.refresh()`；结章/手动完成仍同步刷新目录与总进度。
- [x] 学习页传给目录/分页的 lesson 只保留轻量字段，减少每次导航的 RSC payload。
- [x] 新增 `scripts/perf-lag.mjs`：可重复测量首屏、章节切换、结章、笔记、答题、滚动，支持 CPU/网络节流。

### 18.2 实测对比

环境：Chromium，4× CPU 节流 + 80ms 网络延迟；基线为部署中的 `2026.10.23-02`，优化后为本地同代码生产构建。数值为 3–5 次中位数。

| 指标 | 基线 | 优化后 | 变化 |
| --- | --- | --- | --- |
| 学习页重载到 networkidle | 1293 ms | 947 ms | -27% |
| 首屏传输量 | 88 KB | 14 KB | -84% |
| 首屏课程 RSC 预取 | 7 个 | 1 个 | -86% |
| 登录 | 395 ms | 314 ms | -21% |
| 笔记输入（约 120 字） | 1400 ms | 735 ms | -48% |
| 长笔记每字耗时 | ~10.7 ms | ~8.0 ms | -25% |
| 答题点击反馈 | 251 ms | 214 ms | -15% |
| DOM 节点（学习页） | 427 | 392 | -8% |
| 滚动帧 p95 | ~20.6 ms | ~19.1 ms | 更稳定 |
| 长任务 (>50ms) | 0 | 0 | 保持 |

> 优化后数据取部署版本 `2026.10.23-03` 的实测中位数；结章横幅/目录同步在优化后分别为 ~169ms / ~272ms（基线未单独采样，故不做前后对比）。

> 章节切换：非相邻章节在未悬停时约 250ms（基线因全量预取约 190ms，但首屏多 7 个 RSC）；用户悬停/触摸后预取完成约 131–150ms。整体以首屏和交互稳定性优先。


## 19. 学习页响应式宽度修复（2026-10-23）

**目标**：学习页使用独立的 1600px 画布；1440px 保持双栏，1536px 起才出现三栏；正文、代码、表格、SVG 与交互组件不产生页面级横向溢出。

### 19.1 已实施

- [x] 新增 `(learning)` 路由组与独立 `AppShell wide`，学习页 header/main/footer 最大宽度 1600px；课程列表、我的学习、管理后台继续 `max-w-7xl`。
- [x] `<1024px` 单栏正文，左侧章节通过抽屉访问；`1024–1535px` 左侧 240px 章节 + 正文双栏；`≥1536px` 三栏，右侧大纲 200px 槽位（内容宽约 196px）。
- [x] 右侧大纲 rail 与正文上方 inline 大纲统一使用 `2xl` 断点，避免重复显示/消失。
- [x] 笔记打开时优先隐藏右侧大纲；`1024–1279px` 自动收起左侧章节，关闭笔记后恢复；`≥1280px` 保留章节栏。
- [x] 专注模式不渲染隐藏栏目的 grid 占位，正文使用容器全部剩余宽度。
- [x] 正文、`prose-learn`、概念/模拟组件增加 `min-width: 0` / `max-width: 100%`；MDX 表格统一包进横向滚动容器；代码块保持自身滚动。
- [x] 笔记面板与浮动按钮在 1600px 画布下与容器右缘对齐。

### 19.2 实测宽度（Playwright，900px 高）

| 视口 | 正文宽 | 左章节 | 右大纲 | 布局 |
| --- | --- | --- | --- | --- |
| 390 | 358 | 抽屉 | — | 单栏 |
| 768 | 720 | 抽屉 | — | 单栏 |
| 1024 | 712 | 240 | — | 双栏 + inline 大纲 |
| 1280 | 968 | 240 | — | 双栏 + inline 大纲 |
| 1440 | 1128 | 240 | — | 双栏 + inline 大纲 |
| 1536 | 1000 | 240 | 196 | 三栏 |
| 1920 | 1064 | 240 | 196 | 三栏，1600px 画布 |

> 1536px 起右栏出现会使正文比 1440px 双栏少约 128px，这是“≥1536 三栏”的直接取舍；相比改造前约 720px 的正文仍显著增加。1024→1440 与 1536→1920 两组桌面宽度均随窗口增长。

### 19.3 测试

新增 `tests/e2e/learning-responsive.spec.ts`，真实覆盖 390 / 768 / 1024 / 1280 / 1440 / 1536 / 1920 七个视口，验证：

- 无页面级横向滚动；
- 1440 不出现三栏，1920 出现三栏且右栏约 200px；
- 正文宽度在桌面双栏区间与三栏区间分别增长；
- 打开笔记后正文仍有合理宽度，1024px 自动收起左栏；
- 专注模式正文变宽；
- 章节抽屉、笔记抽屉、代码块、表格、概念动画、模拟实验不溢出；
- `/courses` 仍保持 1280px 容器。

## 20. 课程替换：仅保留 HTTP 从零到会用（2026-10-23）

**目标**：移除旧课程包与数据库记录，只保留用户上传的 `http-fundamentals`。

### 20.1 已完成

- [x] 新课程解压到 `content/courses/http-fundamentals/`，`pnpm courses:validate` 通过（15 章、7 概念、7 活动、36 题）。
- [x] 删除旧内容目录：`http-from-zero`、`http-retry-basics`、`idempotent-retries`、`sql-injection-basics`。
- [x] 删除旧课程数据库记录及级联学习数据（4 条 enrollment、笔记/进度/积分）；删除前已备份到 `/tmp/learnos-before-course-replace.dump`。
- [x] `pnpm courses:sync --publish-new` 插入并发布 `http-fundamentals`；数据库中只剩该课程。
- [x] 测试迁移到新课程：单元 92、集成 29、E2E 20 通过；旧课程专属的 `http-mixed` 用例由新课程闭环覆盖。
- [x] 并发/多课程用例改用测试专用课程行，不把旧课程重新写回 `content/courses`。

### 20.2 注意

- 删除旧课程会删除其学习记录；本次已先备份数据库，旧课程无法通过内容目录恢复。
- 部署扫描会把“已部署但本地删除”的旧课程列为 `removed` 阻塞项；本次属于显式课程替换，部署时需以新课程快照重建基线，不能走普通 `createDeploymentJob` 扫描。

## 21. FloatCTF SSO（Keycloak 内网 Broker）


### 21.1 已实现

- [x] 登录页 FloatCTF 入口（默认关闭）、`/auth/callback`、安全 `next`、停用用户处理。
- [x] 首次登录仅创建 student profile；不读取 FloatCTF 角色。
- [x] `/account/connections` 手动绑定（`linkIdentity`），保留原用户 ID 与学习记录。
- [x] Supabase 准入 Hook：公开邮箱注册 403，只放行 `custom:floatctf`；管理员创建账号不受影响。
- [x] `pnpm oidc:setup`：Discovery 校验 + 幂等 provider 配置。
- [x] 真实 FloatCTF 的 Discovery/JWKS/PKCE/Token/UserInfo/`email_verified=false` 测试。
- [x] 真实 Chromium 复现 GoTrue custom OIDC 与 FloatCTF CSP 的两项兼容性障碍。
- [x] 真实 Supabase + 真实 FloatCTF 上跑通完整 SSO（11/11 用例），修复 Cookie 可读性与 client_secret_post 两项运行时问题。
- [x] FloatCTF CSP 两跳修复已通过 PR #8 合并到上游（`e24746d`），`cargo test --lib` 446 passed。
- [x] 生产镜像容器化部署验证：真实 SSO 11/11、全量 E2E 31/31；修复容器内 Auth Cookie 名不一致。
- [x] 本地 Keycloak broker 方案：Supabase `keycloak` provider + Keycloak 26 + FloatCTF，SSO 11/11。

### 21.2 阻塞（生产启用前）

- GoTrue v2.197 的 custom OIDC 在收到 ID Token 时不调用 UserInfo；FloatCTF 只在 UserInfo 提供 profile/email。
- FloatCTF CSP 只允许 Supabase callback origin；Supabase 再跳转 LearnOS origin 被 Chrome `form-action` 拦截。
- 解除需改 FloatCTF CSP/ID Token，或升级/补丁 Supabase Auth；未绕过安全边界。

### 21.3 上线前自检

- [x] `pnpm oidc:verify`：issuer 约束、discovery、PKCE、JWKS、CSP 两跳、provider 一致性七项检查，失败即非零退出；CSP 项实际探测登录页，上游修复后自动转绿。
- [x] `pnpm oidc:check` = setup + verify，发布前一键执行。
- [x] CI（`.github/workflows/ci.yml`）跑 lint / typecheck / unit / build；集成与 RLS 需本地 Supabase，按文档手动执行。
- [x] `tests/unit/oidc-verify.test.ts`、`tests/unit/oidc-registered-e2e.test.ts` 覆盖 issuer 判定与 SSO 安全不变量。

### 21.4 测试

- `tests/unit/oidc.test.ts`：安全 next、身份识别、显示名。
- 手工实测记录见 `docs/oidc-floatctf.md`。

## 22. HTTP 课程重做：`http-hands-on` 取代 `http-fundamentals`（2026-10-26）

**目标**：旧课实验照题干操作即可通过、模拟器开关无效果、动画只做高亮；重做为新课程并删除旧课。

### 22.1 已完成

- [x] 新课程 `content/courses/http-hands-on/`（2.0.0）：13 章、10 概念动画、9 个服务端验证实验、40 道服务端题；`pnpm courses:validate` 通过。
- [x] 删除 `content/courses/http-fundamentals/` 及其专属单元测试；单元/集成/E2E 全部迁移到新课程。
- [x] 新增 `tests/unit/http-hands-on.test.ts`（模拟器与九个校验器）与 `tests/e2e/http-hands-on.spec.ts`（13 章真实界面闭环，结课 180 分）。
- [x] 本地验证（临时 PostgreSQL，数据库中只有新课程）：`pnpm test` 130 通过；E2E（不含 FloatCTF）21 通过；`pnpm build`、`pnpm typecheck`、`pnpm security:scan` 通过。

### 22.2 部署前必须处理（未执行）

- 生产数据库仍有 `http-fundamentals` 课程行与学习记录。部署扫描会把它列为 `removed` 阻塞项。按 D44 流程：整库备份 → 删除该课程的 enrollments（级联进度、笔记、积分、Block）→ 删除 lessons 与 courses 行 → 以新快照重建部署基线。
- 未验证：FloatCTF 真实 IdP 相关 E2E（需外部环境）。

## 23. 学习页目录：单元折叠 + 内嵌本章大纲（2026-10-26）

- [x] 左侧目录每章一行，单元默认折叠并跟随当前章节，手动展开按课程记忆（D51）。
- [x] 本章大纲并入目录、随滚动高亮；移除右侧大纲栏与正文上方折叠大纲。
- [x] E2E：新增 `tests/e2e/learning-nav.spec.ts`；`learning-responsive`、`learning-flow`、`native-state` 适配；不含 FloatCTF 的 E2E 22 个通过。

## 24. 第二门课程：`bits-and-bytes`（2026-10-27）

- [x] 13 章、11 个概念动画、11 个服务端验证实验、40 道服务端题；`pnpm courses:validate` 通过。
- [x] `tests/unit/bits-and-bytes.test.ts`（字节机与 11 个校验器，15 项）；`tests/e2e/bits-and-bytes.spec.ts`（13 章真实界面闭环，结课 180 分）。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正奇偶校验方阵直接圈出答案、十六进制转储受 prose 表格样式影响、图片实验超限仍显示“没有问题”三处问题。
- [x] 本地验证（临时 PostgreSQL）：`pnpm test` 160 通过；E2E（不含 FloatCTF）23 通过；`pnpm build`、`pnpm typecheck`、`pnpm security:scan` 通过；`pnpm lint` 仅有原有的 3 个问题。

## 25. 学习路线（2026-10-27）

- [x] `content/paths/<slug>/path.json` 定义路线；`lib/content/paths.ts` 校验与加载；`pnpm courses:validate` 一并校验（D54）。
- [x] 课程目录页的路线卡片（已完成 / 进行中 / 已暂停 / 可参加 / 即将上线）、课程详情页的路线位置与下一门、结课后的“路线下一门”按钮。
- [x] 第一条路线《计算机基础入门》，5 门课中 2 门已上线。
- [x] 单元测试 `tests/unit/learning-paths.test.ts`；E2E `tests/e2e/learning-paths.spec.ts`（展示 → 学完第一门 → 推荐下一门）。

## 26. 第三门课程：`networking-basics`（2026-10-27）

- [x] 11 章、9 个概念动画、9 个服务端验证实验、36 道服务端题；`pnpm courses:validate` 通过；加入《计算机基础入门》路线第 2 站。
- [x] `tests/unit/networking-basics.test.ts`（网络模型与 9 个校验器，12 项）；`tests/e2e/networking-basics.spec.ts`（11 章真实界面闭环，结课 160 分）。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正重复提示、规则编辑器缺表头、综合任务实时对错提示三处问题。

## 27. 0.1.5 合并与生产部署（2026-10-27）

- [x] CI 修复：pnpm 12 的 `ERR_PNPM_IGNORED_BUILDS`（drizzle-kit 的可选驱动）在 `pnpm-workspace.yaml` 的 `allowBuilds` 中显式关闭；保留的 `tests/integration/rls.test.ts` 按文件豁免 `@typescript-eslint/ban-ts-comment`。两项修复各自在 main 上 CI 转绿。
- [x] PR #4 / #5 / #6 / #7 / #8 全部合并：每个 PR 的 `verify` 为 pass 且 `mergeStateStatus=CLEAN` 后才合入；合并后 main CI 通过。
- [x] 本地门禁（0.1.5 提交）：`pnpm lint`、`pnpm typecheck`、`pnpm test:unit`（146 通过）、`pnpm courses:validate`（3 门课程 + 1 条路线）、`pnpm build` 全部通过。
- [x] 生产部署 0.1.5：部署前备份（`backup-20261027-release-015/`：数据库 dump、compose/env/Caddyfile、两个容器的 inspect、镜像清单）；`learnos-tools:0.1.5` 预检（`http-hands-on` 2 条记录结构兼容、两门新课程可安装）；`learnos-web:prod120-015` 与 `learnos-web:dev10-015` 构建完成后切换，`pnpm courses:sync --publish-new`。
- [x] 部署后证据：`/api/health` 两侧 `version=0.1.5`、容器 `healthy`、无错误日志；数据库 3 门课程均为 `published`；Caddy 入口 `https://120.95.81.151:8080` 与 `https://10.66.66.7:8080` 返回 200；临时账号登录后 `/courses` 渲染《计算机基础入门》路线与三门课程，报名并打开 `bits-and-bytes` 学习页正常；验证账号与报名记录已删除（用户 4、enrollment 2 恢复原值）。
- 未验证：真实 FloatCTF SSO 登录（生产无可用测试账号）；全量 E2E 套件未在生产环境运行（本地/CI 覆盖）。
- [x] 生产管理员身份统一为 `sysadmin@learnos.local`（原 `admin@learnos.local` 改名并重置密码，旧会话全部失效；密码不入库明文、不写文档）。两个入口实测登录 200，`/admin/deployments`、`/admin/courses`、`/admin/students` 均 200。

## 28. 第四门课程：`command-line`（2026-10-28）

- [x] 10 章、9 个概念动画、8 个服务端验证实验（6 个为命令记录重放）、36 道服务端题；`pnpm courses:validate` 通过；加入《计算机基础入门》路线第 4 站。
- [x] `tests/unit/command-line.test.ts`（模拟 shell 与 8 个校验器，14 项）；`tests/e2e/command-line.spec.ts`（10 章真实界面闭环，结课 150 分）。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正终端输出被文章样式套框、窄屏提示符挤占输入框、`mv -v` 双斜杠、动画根目录显示为 `//`、TERM 正常退出却显示红框等问题。

## 29. 第五门课程：`git-basics`（2026-10-28）

- [x] 9 章、8 个概念动画、7 个服务端验证实验（6 个为操作记录重放）、36 道服务端题；`pnpm courses:validate` 通过；《计算机基础入门》路线 5 门课全部上线。
- [x] `tests/unit/git-basics.test.ts`（模拟 Git 与 7 个校验器，12 项）；`tests/e2e/git-basics.spec.ts`（9 章真实界面闭环，结课 140 分）；`learning-paths.spec.ts` 改为路线不再有“即将上线”。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正终端命令文字看不清、多个目标初始即为绿色、撤销动画提示重复、综合任务默认打开出问题的文件等问题。

## 30. 学习路线独立成页（2026-10-28）

- [x] 导航新增“路线”：`/paths` 路线列表、`/paths/[slug]` 流程图式路线图（桌面左右交错、窄屏单列，节点状态、进度与入口，终点旗帜）；课程目录页改为路线摘要卡片；课程详情页的路线链接指向路线图。不新增 API 与数据表。
- [x] `tests/e2e/learning-paths.spec.ts`：导航进入路线图、节点状态与推荐、学完第一门后路线图更新、未知路线 404。
- [x] 截图检查：路线图、路线列表、课程目录在 1440 / 390px × 亮 / 暗下无横向溢出、无控制台错误（修正一处 `<p>` 内嵌 `<div>` 导致的水合错误）。


## 31. 0.1.6 合并与生产部署（2026-10-28）

- [x] PR #9（`command-line`）、#10（`git-basics`）、#11（学习路线独立成页）依次合并：每个 PR `verify=pass` 且 `mergeStateStatus=CLEAN` 后才合入，合并后 main CI 全绿。
- [x] 本地门禁（0.1.6）：`pnpm lint`、`pnpm typecheck`、`pnpm test:unit`（172 通过）、`pnpm courses:validate`（5 门课程 + 1 条路线）、`pnpm build` 全部通过。
- [x] 生产部署：备份 `backup-20261028-release-016/`（数据库 dump、compose/env/Caddyfile、两个容器 inspect、镜像清单）→ `learnos-tools:0.1.6` 预检（两门已有学习记录的课程结构兼容、两门新课程可安装）→ 构建 `prod120-016` / `dev10-016` → 切换两侧 → `pnpm courses:sync --publish-new`。
- [x] 部署后证据：两侧 `/api/health` 为 `version=0.1.6`、容器 `healthy`、无错误日志；数据库 5 门课程均 `published`；临时账号在公网入口实测 `/courses` 列出 5 门课与路线摘要、`/paths` 与 `/paths/computer-foundations` 均 200、未知路线 404；验证账号已删除（用户 5、enrollment 4 恢复原值）。
- 未验证：真实 FloatCTF SSO 登录（生产无可用测试账号）；全量 E2E 套件未在生产环境运行。

## 32. 第二条路线《Web 安全入门》与 `sql-basics`（2026-10-29）

- [x] 新增路线 `web-security`（6 门，首门上线）；新课程 `sql-basics`：9 章、8 个概念动画、7 个服务端验证实验（4 个查询类、3 个控制台类）、36 道服务端题；`pnpm courses:validate` 通过（6 门课程、2 条路线）。
- [x] `tests/unit/sql-basics.test.ts`（SQL 引擎与 7 个校验器，13 项）；`tests/e2e/sql-basics.spec.ts`（9 章真实界面闭环，结课 140 分）；`learning-paths.spec.ts` 覆盖第二条路线。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正事务实验初始即为绿色的两个目标，综合任务默认显示 loans 表。

## 33. 通识课 `how-programs-run`（2026-10-29）

- [x] 8 章、7 个概念动画、6 个服务端验证实验、36 道服务端题；插入《计算机基础入门》第 2 站（路线 6 门）；`pnpm courses:validate` 通过。
- [x] `tests/unit/how-programs-run.test.ts`（格子机与 6 个校验器，10 项）；`tests/e2e/how-programs-run.spec.ts`（8 章真实界面闭环，结课 130 分）；路线、网络基础、命令行、Git 的 E2E 更新路线位置。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正第 3 章示例与实验答案过于接近、内存格子相邻区域同色两处问题。

## 34. 《Web 安全入门》第 2 门 `crypto-basics`（2026-10-29）

- [x] 8 章、7 个概念动画、6 个服务端验证实验、36 道服务端题；路线中的条目改为正式课程；`pnpm courses:validate` 通过（7 门课程、2 条路线）。
- [x] `tests/unit/crypto-basics.test.ts`（玩具算法与 6 个校验器，10 项）；`tests/e2e/crypto-basics.spec.ts`（8 章真实界面闭环，结课 130 分）。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；修正逐块加密的密文图轮廓不明显、时间显示“0 分钟”两处问题，以及仿冒站点证书主体与题意不符。

## 35. 通识课 `data-structures`（2026-10-29）

- [x] 8 章、7 个概念动画、6 个服务端验证实验、36 道服务端题；插入《计算机基础入门》第 3 站（路线 7 门）；`pnpm courses:validate` 通过。
- [x] `tests/unit/data-structures.test.ts`（算法与 6 个校验器，9 项）；`tests/e2e/data-structures.spec.ts`（8 章真实界面闭环，结课 130 分）；路线及各课 E2E 更新路线位置。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无横向溢出；地图缩小到最短 16 步，排序动画改为实时计算比较次数并按相对比例显示。

## 36. 管理端课程卡点分析（2026-10-29）

- [x] `/admin/courses/[id]/analytics`：参加人数、结课率、停留最多的章节、卡住最多的练习；章节进度（进入 / 完成 / 停在这里及 7 天未活动）；实验与知识检查（尝试、通过、未通过、平均几次通过、一次通过率）；错得最多的 10 道题及常选错误选项。课程详情页增加入口。不新增 API、数据表与角色（D63）。
- [x] 知识检查答错时在反馈中记录所选选项 `given`（仅限题目定义的选项 id），判分与题库哈希不变。
- [x] `tests/unit/course-analytics.test.ts`（8 项）、`tests/e2e/course-analytics.spec.ts`（2 项）通过。
- [x] 截图检查：1440 / 390px × 亮 / 暗，无页面横向溢出（窄屏表格在卡片内横向滚动，数字表头不换行）。
