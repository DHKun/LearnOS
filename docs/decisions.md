# 实现决策记录

> 记录规格未覆盖或需要明确取舍的实现细节。日期为 2026-10-21（本地开发与验证环境）。

## D01 — 本地 Supabase 使用 CLI + Docker

**背景**：MVP 需要真实的 Auth、PostgreSQL、RLS 与事务验证，且仓库不能提交云端凭据。

**决定**：使用 `npx supabase start`（Docker）提供本地 Auth/Postgres/Studio/Mailpit；迁移放在 `supabase/migrations`；测试连接 `127.0.0.1:54322`。同时读取 CLI 输出的 legacy `ANON_KEY` / `SERVICE_ROLE_KEY`（而不是新版 publishable/secret 字符串），以兼容 `@supabase/supabase-js` 的 RLS 与 service-role 语义。

**影响**：`pnpm db:start` 是本地开发的硬依赖；集成/RLS 测试需要数据库运行。云端部署时替换环境变量即可，无需改代码。

## D02 — 依赖版本固定

**决定**：Next 15.5、React 19.3、Tailwind 4.3、TypeScript 5.9、Zod 3.25、Vitest 3.2、Playwright 1.64，全部精确版本并提交 lockfile。

**理由**：避免浮动版本带来的 API 差异；Zod 3 的 `z.record` 等 API 与现有代码一致。

## D03 — 开发服务器使用 Turbopack

**背景**：本机 Node 26 下 `next dev`（webpack）启动后停在 `Starting...`，请求挂起；`next build` 正常。

**决定**：`dev` 脚本固定为 `next dev --turbopack`。

**影响**：开发启动约 1 秒；生产构建仍使用 Next 默认构建器。执行 `pnpm build` 前应停止 dev 服务器，否则 `.next` 可能被并发写入损坏（README 故障排查记录）。

## D04 — `profiles` 增加 `email` 列

**背景**：规格的 profiles 字段不含 email，但管理端需要展示/搜索学生邮箱，而 `auth.users` 不能通过普通 REST 查询。

**决定**：在 `profiles` 冗余保存 email，由 `handle_new_user` 触发器与管理员建号/种子脚本写入。

**影响**：仅用于管理展示与搜索；身份仍以 `auth.users.id` 为准。邮箱变更不在 MVP 范围。

## D05 — 心跳与交互时间的严格区分

**决定**：`POST /api/learning/heartbeat` 始终更新 `last_seen_at`；仅当 `visible && focused` 且传入的 `lessonId` 与当前章节不同（即发生章节切换）时更新 `last_interaction_at`。事件、状态保存、实验提交、测验、笔记、完成章节会更新 `last_interaction_at`。

**理由**：避免把「打开页面挂着」当作认真学习，同时让阅读导航留下交互痕迹；离线 120 秒只影响在线展示，不影响 enrollment。

## D06 — 停用账号用 `profiles.disabled_at`，不使用 Supabase ban

**背景**：Supabase Auth 的 `ban_duration` 会让已有会话立即失效，`auth.getUser()` 返回空，业务接口只能返回 401，无法区分「未登录」与「被停用」。

**决定**：管理员停用只写 `profiles.disabled_at`；登录 Server Action 在登录后检查并登出；每个 API 通过 `requireUser` 重新读取 profile，停用返回 `403 ACCOUNT_DISABLED`，页面守卫重定向 `/login?reason=disabled`。

**影响**：响应语义稳定；禁用立即对业务接口生效（每次请求查库）。会话 Cookie 本身可能仍存在，但无法调用任何业务接口。生产可叠加网关层封禁。

## D07 — 最终测验由 `config.finalExam` 标记

**决定**：课程 manifest 的 quiz 章节可设 `finalExam: true`；校验要求恰好一个且位于最后。同步写入 `lessons.config.finalExam`；`record_quiz_attempt` 通过该标记决定额外 +50。

**理由**：比「按 position 猜最后一个」更显式，发布校验也可复用。

## D08 — 实验地址使用 `${LABS_ORIGIN}` 占位符（已废弃，见 D22）

**决定**：manifest 中 `entryUrl` 可写 `${LABS_ORIGIN}/lab/`，校验/同步时替换为环境变量值并存入 `lessons.config.entryUrl`。

**影响**：同一份内容可在本地与生产域名使用；换域名后必须重新 `courses:sync`。同步时校验 origin 必须属于 `LABS_ALLOWED_ORIGINS`。

## D09 — 测验答案只存在于仓库服务端文件

**决定**：`quiz.server.json` 包含答案与解析，只由服务端 `fs` 读取；数据库只保存 `content_ref` 路径和 `passScore`；API 手工映射公开字段。

**影响**：答案不进入数据库、API 响应或客户端 bundle；`pnpm security:scan` 扫描构建后的静态资源，检查解析文本是否泄漏。

## D10 — 所有业务写操作走 SECURITY DEFINER RPC

**决定**：浏览器角色只保留 SELECT（以及 notes 的本人读写）权限；进度、积分、测验、事件、状态、提交只能由 service role 调用 SQL 函数。函数内再次校验学生身份、enrollment/lesson 归属、课程状态与完成策略。

**理由**：保证「章节完成 + 结课 + 积分」在同一事务，且 RLS 与 API 双重防护。

**影响**：服务层必须使用 `createAdminClient()`；该模块在浏览器环境直接抛错。任何新增写接口都必须先做归属检查。

## D11 — 笔记仅本人可见，管理员无策略

**决定**：`notes` 的 RLS 策略只匹配 `student_id = auth.uid()`；没有管理员策略，也没有管理员笔记 API。

**影响**：管理员界面明确提示无法读取笔记；即使直接使用数据库连接，普通管理员角色也查不到。

## D12 — 笔记在退出/结课/复习时仍可编辑

**决定**：`save_note` 只要求该课程存在学习记录（任意状态），不要求 active；复习模式只读的是进度，不是笔记。

**理由**：规格允许完成后复习并保留笔记；禁止编辑会给学生造成数据丢失感。

## D13 — 课程结构冻结的实现方式

**决定**：`courses:sync` 在课程已有 enrollment 时比较章节 `slug/position/required/type`、完成策略、测验 `passScore/finalExam`、题库内容哈希、交互 `activityId` 与 validator 源码哈希，有任何差异即失败并提示使用新 slug；无 enrollment 时允许删除/重建章节。发布状态不被普通同步覆盖（仅 `--publish` 显式覆盖）。

**影响**：历史进度不会因章节重排失真；文案与题库可原地更新。需要结构性升级时复制课程目录并发布新 slug。

## D14 — 已完成课程只读复习

**决定**：`enrollments.status=completed` 时播放器显示只读提示；`complete_lesson` 返回既有状态且不发分；`save_submission`/`record_quiz_attempt` 拒绝新的写入，但对已存在的提交/attempt ID 仍返回缓存结果（保证重放幂等）。

**影响**：复习不改变历史进度；网络重试不会报错或重复发分。

## D15 — 实验站点独立域名与 sandbox（已废弃，见 D22）

**决定**：`apps/labs` 由简单 Node 静态服务器（或任意静态主机）默认监听 `0.0.0.0:4310`；浏览器使用的 origin 可以是 `localhost` 或服务器 LAN IP，但必须与 `NEXT_PUBLIC_LABS_ORIGIN` 一致并重新同步课程。iframe 使用 `sandbox="allow-scripts allow-same-origin"`。主站 CSP `frame-src` 与实验站 `frame-ancestors` 互相限制；实验服务器自动把本机非回环 IPv4 加入允许的父页面 origin。

**理由**：满足规格的跨域隔离要求，同时允许可信实验使用现代前端能力。生产环境必须提供 HTTPS 与独立域名。

## D16 — CSRF 策略要求 Origin

**决定**：所有非 GET/HEAD 请求必须带 `Origin` 且匹配 `NEXT_PUBLIC_APP_URL`、请求 URL origin 或 `Host` 头推导出的同源 origin；缺失/不匹配返回 `403 CSRF_ORIGIN_REJECTED`。不提供基于 Referer 的降级。

**影响**：浏览器同源 fetch/表单正常；命令行调用需显式设置 `Origin`。E2E 对此有专门测试。

## D17 — 管理端 30 秒轮询、学生 60 秒心跳

**决定**：管理页面使用客户端 `setInterval(() => router.refresh(), 30_000)`；学习页每 60 秒发心跳，并在可见性/焦点恢复时补发。未引入 WebSocket/SSE。

**影响**：数据最多延迟约 30 秒；服务端无需长连接基础设施。

## D18 — 学生初始密码与密码重置

**决定**：管理员创建学生时输入初始密码（≥8 位），界面一次性展示，建议通过安全渠道转交；密码重置通过 Supabase Auth 邮件，不在响应中返回令牌。MVP 不做学生自助改密页面。

**影响**：本地邮件在 Mailpit 查看；生产需配置 SMTP。

## D19 — 不使用 Supabase Storage

**决定**：MVP 没有图片/附件上传需求，课程资源随仓库部署，实验为静态包。未创建 Storage bucket。

**影响**：减少攻击面；若未来需要上传，必须单独设计权限、类型与大小限制。

## D20 — E2E 浏览器依赖的本地兜底

**背景**：当前开发沙箱无 root，无法 `playwright install-deps` 安装 Chromium 所需系统库与中文字体。

**决定**：仓库不提交二进制依赖；`playwright.config.ts` 在检测到 gitignored 的 `.pwlibs/` 时自动注入 `LD_LIBRARY_PATH` 与 `FONTCONFIG_FILE`。常规环境仍使用官方 `playwright install --with-deps chromium`。

**影响**：仅影响本地测试执行方式，不改变产品行为；README 记录两种路径。

## D21 — 非安全上下文（局域网 HTTP）的 UUID 兜底

**背景**：`crypto.randomUUID()` 只在安全上下文（HTTPS 或 localhost）可用。通过 `http://<LAN-IP>:3000` 访问时，浏览器不把它视为安全上下文，直接调用会抛 `crypto.randomUUID is not a function`，导致实验桥与测验提交崩溃。

**决定**：客户端统一使用 `lib/uuid.ts#createUuid()`：优先 `crypto.randomUUID`，否则用 `crypto.getRandomValues` 生成 RFC 4122 v4；Learning SDK 内置同样的兜底。所有服务继续监听 `0.0.0.0`，以支持局域网演示。

**影响**：局域网 HTTP 下交互实验、测验、状态保存均可正常使用；生产仍应启用 HTTPS。

## D22 — 互动实验改为单站点原生 React 组件

**背景**：MVP 阶段互动实验部署在独立静态站点，通过 iframe + postMessage + Learning SDK 与主站通信。该方案带来第二套部署、跨域配置、CSP/frame-ancestors、Cookie 同主机风险和额外的加载延迟。

**决定**：互动实验全部迁移为主应用内经过审核的 React/TypeScript 组件，通过 `activityId` 在 `lib/activities/catalog.ts` 与 `components/activities/registry.tsx` 显式注册；`ActivityHost` 通过服务端渲染的 enrollment/lesson/初始状态绑定 `LearningClient`，直接调用同源认证 `/api/learning/**`。删除 `apps/labs`、`packages/learning-sdk`、iframe 播放器、postMessage bridge、Labs 静态服务器与全部 `LABS_*` 环境变量。

**数据**：新增迁移 `20250101000600_activity_registry.sql`，仅把 `lessons.config.entryUrl` 替换为 `config.activityId`，保留 course/lesson ID、enrollment、lesson_progress、notes、point_events、quiz_attempts 等全部历史记录；课程同步不再要求 `entryUrl`，已有 enrollment 的课程继续冻结结构、题库与 validator 哈希。

**安全影响**：互动组件与主应用同源，不能依赖 origin 隔离；安全边界改为「显式 registry + 受审核代码 + 服务端归属校验 + httpOnly Cookie + 服务端 validator」。客户端事件仍是可伪造遥测，不能作为过关凭证。

**影响**：部署只需要一个 Next.js 站点、一个域名和现有 Supabase；新互动组件需同时注册 catalog、registry 和服务端 validator。
