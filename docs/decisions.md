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

## D23 — 概念动画与混合内容采用 MDX + 显式 Registry

**决定**：不新增内容块数据库表。article 章节的 MDX 可组合 `<ConceptPlayer>`、`<MiniCheck>` 与现有 `Callout`；`conceptId` 由 `lib/education/concepts.ts` 固定清单管理，组件在 `components/concepts/registry.tsx` 显式按需加载。新增可选 `unit` 写入 `lessons.config.unit`，仅用于目录分组，不参与结构冻结。

**理由**：旧课程无需重做，章节 ID/进度不变；MDX 顺序作者可控；静态校验能拒绝未注册概念；避免为纯展示内容引入新表。

**影响**：概念状态保存在单课时 `activity_states`；每章建议一个概念动画。动画/知识检查不计分，正式测验仍由服务端判分。

## D24 — 课程元数据所有权与同步策略

**决定**：manifest 拥有课程结构、内容版本、题库、validator 与 `activityId`；`title`/`description` 只在创建课程时作为初始值，之后归管理员在线编辑。普通 `courses:sync` 不再覆盖标题/简介；需要以仓库为准时显式执行 `pnpm courses:sync --refresh-metadata`。

**理由**：管理员编辑不应被下一次同步静默回滚，同时保留内容团队显式覆盖的能力。

**影响**：新增纯函数 `lib/content/sync-policy.ts` 与单元测试；结构冻结仍只针对章节、评分与活动/题库哈希。

## D25 — 生产部署收敛为单机 Docker Compose

**背景**：此前的生产方案引入 GitHub Actions、镜像仓库、蓝绿切换、第二台服务器与反向代理，超出本项目单机课程演示的实际需要，也让“复制课程目录 → 上线”变得依赖 Git 流程。

**决定**：生产部署只使用一个 `docker-compose.yml` 管理 `web`（Next.js standalone）与 `updater`（本地更新执行器）；两者使用同一份本地 `content/courses` 源码。对外只发布 3000 端口，保持现有 Supabase 连接。部署版本使用 `YYYY.MM.DD-NN`，记录镜像 ID/标签与课程版本快照，不依赖 Git Commit、GitHub API、镜像仓库或第二条服务器。

**理由**：单机管理员场景下，最少组件即可完成真实构建、容器替换、健康检查和回滚；课程目录是唯一内容真相源，扫描与部署都能直接读取本地文件。

**影响**：`web` 使用 Docker 命名卷外的镜像代码，不再挂载源码；`updater` 需要宿主机 Docker Socket 与项目目录挂载。允许部署期间短暂服务中断，不实现零停机。

## D26 — updater 只执行写死的固定操作，任务持久化在 Supabase

**决定**：`deploy/updater/updater.mjs` 只从 `deployment_jobs` 领取任务，执行固定序列：制作源码快照 → 构建 tools 镜像（`courses:prepare` / `courses:validate`）→ `docker compose build web` → 保存旧镜像引用 → `courses:preflight` → `courses:sync` → `docker compose up -d --no-deps web` → 健康检查 → `promote_deployment`。不接受任何来自 Web UI 的命令或参数；版本号格式在数据库约束与代码中双重校验。

任务、阶段、日志、课程快照、镜像引用都写入 `deployment_jobs` / `deployment_state`（service role only，RLS 无浏览器策略）。Web 容器重启不影响 updater；updater 重启时把中断的活动任务标记为失败，避免永久卡单。

**理由**：满足“Web 重启不丢结果”和“构建失败不替换旧容器”，同时用最小持久化替代日志服务/任务队列。

**影响**：updater 容器拥有宿主级 Docker 权限；这是单机管理员自用工具的明确风险取舍，README 已注明不要暴露到公网。旧镜像在构建前被标记为 `learnos-web:rollback-<jobId>`，`current` 标签始终指向可运行镜像；构建/校验/兼容性失败时恢复旧标签。

## D27 — 扫描使用源码摘要 + 结构摘要，部署使用固定快照

**决定**：`lib/deployments/course-snapshot.ts` 对每门课程计算：
- `sourceDigest`：目录内全部文件（含 MDX/组件/题库/validator）的路径与 SHA-256；
- `structuralDigest`：章节顺序/类型/必修/完成策略、quiz 内容哈希/及格线/finalExam、activityId/validatorId/validator 源码指纹。

扫描与最近一次成功部署的课程快照比较，输出新课程/有更新/已是最新/版本冲突/扫描失败/已移除。版本号未变但 `sourceDigest` 变化时明确警告；结构变化且该课程已有学习记录时直接判为冲突并阻止部署。真正部署时 updater 先把源码复制为固定快照，后续 prepare/validate/build/sync 都基于该快照，避免构建过程中课程文件被修改。

**理由**：不依赖 Git 也能判断“内容是否变化”；区分文案/UI 变化与结构/评分变化，延续既有课程冻结策略；快照保证构建与数据库同步看到同一份源码。

**影响**：扫描只读，不触发构建；扫描失败或冲突会阻止部署。部署记录保存课程版本和摘要，作为下一次扫描与回滚兼容性检查的基线。

## D28 — 扫描读取宿主机课程目录，运行时读取镜像内容

**背景**：Web 运行在容器镜像中，镜像里的 `content/courses` 是上一次构建的固定副本。管理员在宿主机复制新课程目录后，如果扫描只读容器内文件，将永远看不到新目录。

**决定**：Compose 把宿主机 `content/courses` 以只读方式挂载到 `web` 容器的 `/workspace/content/courses`，并设置 `LEARNOS_SCAN_CONTENT_ROOT` 只供扫描使用。学生运行时仍通过 `CONTENT_ROOT=/app/content/courses` 读取镜像内容，因此未部署的文案修改不会提前影响学生。

**理由**：扫描与 updater 使用同一份宿主机源码；运行时内容仍由成功部署的镜像决定，避免“文件已改但没构建”的隐性不一致。

**影响**：扫描能看到新复制目录；部署成功后新镜像包含该目录。若只改宿主机文件不部署，扫描显示「有更新」，学生仍看到旧版本。

## D29 — 部署自动发布新课程，保留已有课程发布状态

**决定**：`pnpm courses:sync` 默认仍把新课程设为 `draft`；updater 执行 `pnpm courses:sync --publish-new`，只对新创建的课程行设为 `published`，已有课程的 `status` 不被覆盖。

**理由**：最终体验要求「复制目录 → 扫描 → 部署 → 学生看到新课程」，不应再要求一次手工发布；同时不能把管理员刻意归档/草稿的已有课程重新发布。

**影响**：部署后新课程立即可见；管理员仍可在 `/admin/courses` 归档或调整。`--publish` 仍用于显式全部发布。

## D30 — 扫描挂载使用宿主机绝对路径，updater 自动探测

**背景**：updater 容器内的 Compose 以 `/workspace` 为项目目录，但 Docker 守护进程按宿主机路径解析 bind mount。直接写 `./content/courses` 会在宿主机创建空的 `/workspace/content/courses`，导致扫描看不到宿主机课程。

**决定**：Compose 的 web 扫描挂载使用 `${LEARNOS_HOST_PROJECT_DIR:-.}/content/courses`。updater 启动时通过 `docker inspect` 读取自身 `/workspace` 挂载的 `Source`，把真实宿主机路径写入 `LEARNOS_HOST_PROJECT_DIR`，再执行所有 Compose 命令；宿主机手动 `docker compose up` 时默认 `.` 仍然正确。

**影响**：扫描与 updater 看到同一份宿主机源码；无需在 `.env.local` 手动维护绝对路径。课程文件需对容器用户（uid 1001）可读，README 给出 `chmod -R a+rX content/courses`。

## D31 — Manifest v3：MDX 负责顺序，Manifest 只声明可验证 Block

**背景**：固定 Article/Activity/Quiz 页面模板无法表达“文字 → 动画 → 文字 → 实验 → 文字 → 知识检查 → 总结”的混合章节；同时需要保持旧 v2 课程和历史数据。

**决定**：新增 `schemaVersion: 3`，仅在 `article` 章节增加可选 `blocks`（simulation/question）与 `completion`（manual/all/any）。普通文字、图片、表格、公式、Callout、MiniCheck 继续直接写在 MDX，不进入 JSON Block。MDX 是章节内容与顺序的唯一来源；Manifest 只声明需要正式验证的内容及其完成条件。v2 继续完全兼容。

**理由**：避免维护两套顺序；纯文字课程无需任何插件；章节可以完全没有 Block，也可以有多个动画/实验/题；不把展示性动画错误地当成可信完成条件。

**影响**：`courses:validate` 需要同时解析 Manifest 与 MDX；`courses:sync` 把 `blocks/completion/chapterHash` 写入 `lessons.config`；页面使用统一的 `ChapterLearningProvider` 渲染混合章节。

## D32 — Block 状态使用 blockId 命名空间

**决定**：混合章节的 Lesson State 使用 `{ schemaVersion: 2, blocks: { [blockId]: ... } }`。`ChapterLearningProvider` 持有一个 LearningClient 和整章状态；每个 `BlockScope` 提供 scoped SDK，`saveState` 合并到自己的 blockId，`submit` 调用 Block 接口，`complete` 为 no-op。统一 `useBlockState`（复用 `useActivityState` 的 600ms 防抖与版本乐观锁）。

**理由**：当前 Lesson 级状态在多个 Concept/Activity 同时保存时会互相覆盖；整章共享一个 client 与串行化队列可以避免丢失更新，同时保留重开恢复和多标签冲突提示。

**影响**：旧 v2 article 的扁平 Concept 状态会作为第一个 concept Block 的 legacy 状态读取，并在首次保存时迁移到 v2 命名空间。旧独立 interactive 章节仍使用原有 Lesson 级状态。

## D33 — Block 通过结果与章节完成在数据库事务中判定

**决定**：新增 `block_attempts`（幂等尝试）与 `block_results`（每 enrollment/lesson/block 可信通过状态），以及 `save_block_result` / `learnos_chapter_completion_satisfied` RPC。服务端先运行 validator 或题库评分，再调用 RPC；RPC 校验 Block 类型、记录尝试、更新通过状态，并按 `completion.mode` 的 all/any 规则完成章节。章节完成、point ledger 与结课判定在同一事务；`complete_lesson` 拒绝绕过 v3 server_validated 章节。

**理由**：客户端 `passed: true` 不可信；多 Block 章节必须按服务端记录计算完成；积分只能在首次完成时发一次。

**影响**：新增 `/api/learning/blocks/submit`；`block_results` 没有浏览器策略，仅 service role 可写；一个章节有多个 Block 也只发一次 +10。

## D34 — MDX 使用 AST 校验，客户端组件禁止导入服务端答案

**决定**：`pnpm courses:validate` 使用 `remark-parse` + `remark-mdx` 解析 MDX，提取大写 JSX 组件与字符串 props，校验 Concept/Activity/Block 引用、声明 Block 的渲染次数和组件类型；未知组件失败。课程 prepare 与部署快照额外拒绝客户端组件导入 `validators.ts`、`*.server.json` 或 `assessments/`。

**理由**：正则扫描无法可靠处理嵌套、换行、属性顺序和表达式；题库/validator 进入客户端 bundle 会泄露正式答案。

**影响**：课程作者必须保证每个声明的 Block 在 MDX 中恰好渲染一次；允许集合为 `Callout`、`MiniCheck`、`ConceptPlayer`、`SimulationBlock`、`KnowledgeCheck`。
