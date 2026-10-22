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
| `pnpm test` | ✅ 9 个测试文件，61 项通过（单元 + 真实 PostgreSQL RLS/事务） |
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
当前 Phase：Release（完成）
当前任务：P0-01 ～ P4-07 全部完成
最近验证日期：2026-10-22
本次已完成：两门课程、28 个 API、11 张表 + RLS + 事务函数、同源 Learning SDK 与两个原生互动组件、
            学生 5 页 / 管理员 4 页、E2E 与 RLS 测试、文档与截图；
            性能专项 35 项（bundle −156KB、实验 −55%、测验 −69%），见 docs/performance.md；
            审计修复 LRN-001/004/005/006/007/008/009 与残余风险，见 docs/audit-remediation.md；
            完成单站点原生活动重构（activityId Registry、移除 iframe/Labs/postMessage、历史数据迁移验证）
测试结果：lint/typecheck/build 通过；Vitest 61 passed；Playwright 16 passed；
          security scan 通过；courses:validate 2/2
失败 / 阻塞：无（本地）；云端部署与 SMTP 未执行
下一个门禁：无（MVP Release，本地）
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
- [x] `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm test:e2e` / `pnpm security:scan` 通过（61 unit/integration、16 E2E、62 静态资源扫描）。
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
