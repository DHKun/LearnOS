# LearnOS 架构与安全设计

> 本文描述实现层面的结构与约束。业务定义以 [`MVP-SPEC.md`](MVP-SPEC.md) 为准。

## 1. 运行时拓扑

```text
浏览器（学生 / 管理员）
  ├── Next.js App Router 页面（Server Components）
  ├── 客户端组件：播放器、原生互动活动、笔记、管理端抽屉
  ├── LearningProvider + LearningClient（同源 SDK）
  └── 同源 fetch → /api/** Route Handlers
                         │
                         ├── requireUser / requireApiStudent / requireApiAdmin
                         ├── Zod 入参校验 + Origin/CSRF 校验
                         ├── services（业务规则与归属检查）
                         └── Supabase service-role RPC（事务函数）
                                      │
                                PostgreSQL + RLS
                                      ▲
                                Supabase Auth（Cookie 会话）
```

- 只有一个 Next.js 应用、一个域名和现有 Supabase 服务；没有独立 Labs 站点、静态实验服务器、iframe 或 postMessage。
- 互动实验是仓库内经过审核的 React 组件，通过 `activityId` 在 `components/activities/registry.tsx` 显式注册与按需加载。
- Supabase Auth 是唯一身份源；`profiles` 保存角色与停用状态。

## 2. 请求生命周期

1. `middleware.ts` 调用 `@supabase/ssr` 刷新 Cookie 会话；未登录访问受保护页面时跳转 `/login`。
2. 页面守卫 `requireStudent` / `requireAdmin` 读取 `auth.getUser()` 与 `profiles`，处理停用与角色跳转。
3. API Route Handler：
   - `assertMutationRequest`：非 GET/HEAD 请求必须有与本应用一致的 `Origin`，否则 `403 CSRF_ORIGIN_REJECTED`。
   - `requireUser`：以服务端校验后的身份确定用户，忽略任何客户端自报的 `studentId` / `role`。
   - Zod 解析 body/query；失败返回 `422 VALIDATION_ERROR`，不泄露内部细节。
   - 调用 service；service 必须验证资源归属（enrollment 属于当前学生、lesson 属于课程、课程状态允许操作）。
   - 统一返回 `{ data }` 或 `{ error: { code, message } }`。
4. 需要原子性的写操作调用 PostgreSQL `SECURITY DEFINER` 函数；函数再次校验学生身份、归属与状态，并在同一事务内写进度、结课与积分。

## 3. 数据模型（核心 11 张 + 章节 Block 2 张）

| 表 | 作用 | 关键约束 |
| --- | --- | --- |
| `profiles` | 账户角色、显示名、停用时间 | PK = `auth.users.id`；`role in (student, admin)` |
| `courses` | 课程元数据与发布状态 | `slug` 唯一；`status in (draft, published, archived)` |
| `lessons` | 章节、顺序、类型、完成策略 | `UNIQUE(course_id, slug)`、`UNIQUE(course_id, position)` |
| `enrollments` | 学习记录与最近在线/交互 | `UNIQUE(student_id, course_id)`；部分唯一索引保证每人仅一条 `active` |
| `lesson_progress` | 每 enrollment 每章节状态 | PK `(enrollment_id, lesson_id)`；仅 completed 计入进度 |
| `activity_events` | 互动遥测事件 | PK = 客户端 UUID，天然幂等；按 enrollment/lesson 建索引 |
| `activity_states` | 实验自动保存状态 | PK `(enrollment_id, lesson_id)`；`version` 乐观锁 |
| `activity_submissions` | 实验最终提交与验证结果 | PK = 请求 UUID；重复请求返回首次结果 |
| `quiz_attempts` | 测验尝试与得分 | PK = 提交 UUID；分数 0–100 |
| `notes` | 私人章节笔记 | PK `(student_id, lesson_id)`；`octet_length(content) <= 65536` |
| `point_events` | 积分台账 | `dedupe_key` 唯一；只能由事务函数写入 |
| `block_attempts` | 章节 Block 的每次正式提交 | PK = 请求 UUID；同 ID 不同请求 hash 拒绝 |
| `block_results` | 每 enrollment/lesson/block 的可信通过状态 | PK `(enrollment_id, lesson_id, block_id)`；`passed` 只由服务端事务写入 |

`profiles.email` 为便于管理端展示而冗余保存（见 [`decisions.md`](decisions.md)）。

`block_attempts` / `block_results` 是章节级 Block 的持久化结构；`block_attempts` 保证提交幂等，`block_results` 是章节完成判定的可信来源。二者启用 RLS 且没有浏览器策略，仅 service role 可访问。

另有 2 张运维表：`deployment_jobs` 保存部署/回滚任务、阶段、日志、课程快照和镜像引用；`deployment_state` 保存当前/上一个成功版本。二者同样仅 service role 可访问。

### 3.0 课程部署表

| 表 | 作用 | 关键约束 |
| --- | --- | --- |
| `deployment_jobs` | 部署/回滚任务、日志、课程快照 | 部分唯一索引保证同一时间最多一个活动任务；版本格式 `YYYY.MM.DD-NN` |
| `deployment_state` | 当前/上一成功版本与镜像 ID | 单行 `id=true`；由 `promote_deployment` / `promote_rollback` 事务更新 |

### 3.1 业务不变量

- `one_active_enrollment_per_student`：`UNIQUE(student_id) WHERE status='active'`。
- 课程进度 = 已完成必修章节数 ÷ 必修章节总数；无必修章节的课程不能发布。
- 完成全部必修章节（含最终测验通过）时，`enrollments.status` 在同一事务改为 `completed` 并释放占用。
- 退出课程只改状态，不删除进度、事件、状态或笔记；恢复时复用同一 enrollment。
- 笔记不随退出/结课删除；完成后进入只读复习，不重复发分。

## 4. 事务函数（服务端专用）

定义于 `supabase/migrations/20250101000200_functions.sql`，执行权限仅授予 `service_role`，浏览器角色被 `REVOKE`。

| 函数 | 职责 |
| --- | --- |
| `join_course` | 新建/恢复/幂等返回 enrollment；唯一冲突转 `ACTIVE_COURSE_EXISTS` |
| `abandon_course` | `active → abandoned`，保留数据 |
| `heartbeat` | 更新 `last_seen_at`、当前章节，并将当前章节标记为 `in_progress`（不降级 completed）；仅在章节变化且可见/聚焦时更新 `last_interaction_at` |
| `complete_lesson` | 图文章节/reported 实验完成、首次 +10、结课判定；拒绝 manual 绕过 v3 server_validated 章节 |
| `save_block_result` | 记录 Block 尝试、幂等校验、更新 `block_results`、按 all/any 完成章节并 +10 |
| `learnos_chapter_completion_satisfied` | 根据 `lessons.config.completion` 与 `block_results` 计算完成条件 |
| `record_event` | 事件幂等写入、频率限制、交互时间更新 |
| `save_state` | `expectedVersion` 乐观锁；冲突 `STATE_VERSION_CONFLICT` |
| `save_submission` | 写入验证结果；通过才完成章节并 +10；重复 ID 返回缓存结果 |
| `record_quiz_attempt` | 保存服务端评分；首次通过 +10，最终测验首次通过 +50；触发结课 |
| `save_note` | 校验课程归属后写入笔记，更新交互时间 |

积分去重键：

```text
lesson:<enrollmentId>:<lessonId>   → 每章节首次完成 +10
final_quiz:<enrollmentId>          → 最终测验首次通过 +50
```

## 5. 状态机

### 5.1 Enrollment

```text
none ──join──▶ active ──finish──▶ completed ──review──▶ read-only
                  │
                  └──abandon──▶ abandoned ──join──▶ active（保留进度）
```

- 同课程重复 `join`：`active`/`completed` 直接返回原记录；`abandoned` 恢复为 `active`。
- 已有其他 `active` 时：`409 ACTIVE_COURSE_EXISTS`。
- `archived` 课程禁止新报名，已有记录仍可完成/恢复。
- `draft` 仅管理员可见，不产生学生 enrollment。

### 5.2 Lesson

```text
not_started → in_progress → completed
```

- 手动章节：学生阅读后点击「标记本章完成」，来源 `manual`；声明 `all/any` 的章节由 Block 事务自动完成。
- Block 章节：`blocks` 由服务端验证器/题库记录到 `block_results`；`completion.mode=all/any` 满足后由 `save_block_result` 自动完成，禁止直接调用 `complete_lesson` 绕过。
- 没有独立的 interactive / quiz 章节类型；模拟实验与正式题目都通过 chapter Block 提交，`attemptId` 幂等。
- 动画播放、文字阅读、MiniCheck 只产生遥测或本地反馈，不参与正式通过判定。

## 6. 在线状态

| 字段 | 含义 | 更新来源 |
| --- | --- | --- |
| `enrollments.status = active` | 课程进行中（可能离线） | 报名/退出/结课 |
| `last_seen_at` | 最近页面心跳 | 学生学习页约 60 秒心跳（仅可见页面） |
| `last_interaction_at` | 最近有效学习操作 | 章节切换、事件、状态保存、实验提交、测验、笔记等 |

`is_online = active AND now - last_seen_at <= 120s`。离线不会改变 enrollment 状态；管理端分别展示「最近在线」与「最近交互」。

## 7. 内容管线

```text
content/courses/<slug>/course.json
  ├── *.mdx                    → 服务端 compileMDX（可信仓库内容）
  ├── concepts/*.tsx           → 课程插件动画（按需加载）
  ├── activities/*.tsx         → 课程插件原生实验（按需加载）
  ├── assessments/*.server.json→ 章节知识检查/最终测验；仅服务端读取
  └── validators.ts            → 静态注册到 server-only validator registry

pnpm courses:prepare  → 解析 plugins、生成组件/验证器 Registry
pnpm courses:validate → Manifest v3、MDX AST、Block/题库/activity/validator、路径/符号链接校验
pnpm courses:sync     → upsert courses/lessons；有 enrollment 时冻结结构、必需 Block、题库与验证器
```

- 数据库保存 `content_ref` 与 `config`：
  - 章节：blocks/completion/chapterHash/finalExam；
  - `chapterHash` 仅覆盖必需 Block 的结构，可选练习 Block 不影响。
- `chapterHash` 由必需 Block 的类型、activity validator 指纹、章节题库哈希、完成模式/requiredBlocks 计算；新增可选 Block 不改变该哈希。
- MDX 通过 `remark-parse` + `remark-mdx` AST 校验：声明的 Block 必须恰好渲染一次，组件类型必须匹配，Concept/Activity 必须已注册。
- 章节知识检查/最终测验答案只在服务端读取；`resolveChapterBlocks` 只输出公开题目，不包含 answer/explanation。
- 客户端组件不能导入 `validators.ts`、`*.server.json` 或 `assessments/`；`courses:prepare` 与部署扫描都会拒绝。
- 题库内容与 validator 源码哈希在首次同步时冻结；已有报名后必需结构变更会被拒绝，结构性升级使用新 course slug。

## 8. 原生活动与 Learning SDK

1. 服务端学习页统一渲染 MDX；`SimulationBlock` / `KnowledgeCheck` 用 `BlockScope` 绑定当前 enrollment、lesson、blockId 与服务端读取的初始状态/版本。
2. `LearningProvider` 创建 `LearningClient`，自动绑定 lesson/enrollment；组件不能选择学生身份，API 仍逐请求校验归属。
3. SDK 直接使用同源认证 API：

| SDK | 动作 |
| --- | --- |
| `start()` | `POST /api/learning/events`，`session_start` 按会话 ID 去重 |
| `track()` | `POST /api/learning/events`，事件 UUID 幂等，payload 完整持久化 |
| `saveState()` | 600ms 防抖 → `PUT /api/learning/states/:lessonId`，`expectedVersion` 乐观锁；冲突回传 409 |
| `complete()` | BlockScope 中为 no-op；完成状态只由 Block/complete API 的服务端事务决定 |
| `submit()` | 只允许 BlockScope：`POST /api/learning/blocks/submit`；基础 client 不提供独立实验提交 |
| `refreshState()` | 重新读取服务端状态/版本，用于冲突恢复 |

4. 混合章节使用两层 Context：
   - `ChapterLearningProvider` 持有一个 `LearningClient` 与整章 `{ schemaVersion:2, blocks }` 状态；
   - 每个 `BlockScope` 提供 scoped SDK，`saveState` 合并到所属 `blockId`，`submit` 调用 Block 接口，`complete` 为 no-op。
5. 组件从 `initialState` 恢复；状态变化经 SDK 串行保存；`pagehide` 以 `keepalive` 尽力保存最后一次状态。
6. 互动组件与主应用同源，只通过 `/api/learning/**` 读写；禁止任意模块导入、`eval` 或执行用户输入脚本。客户端事件仅是学习遥测，不是不可伪造的过关证明；`block_results` 只由服务端事务写入。
7. `ChapterProgress` 显示必需 Block 的通过状态与 all/any 规则；满足条件后 `router.refresh()` 展示服务端完成状态。

## 9. 安全控制

- **身份**：Supabase Cookie 会话；服务端 `auth.getUser()`；角色来自 `profiles`；禁用账号在每个请求重新检查。
- **RLS**：核心 11 张 + 章节 Block 2 张 + 部署 2 张表全部启用；学生仅读自己（课程目录/章节按已发布或已报名），管理员读全部；`notes` 仅本人；`block_attempts`/`block_results`/部署表没有浏览器策略。浏览器角色无进度/积分/Block 写权限。
- **写入**：进度/积分/测验只能经 service-role 事务函数；浏览器无法直接写 `lesson_progress`、`point_events`、`quiz_attempts`。
- **CSRF**：写请求校验 Origin；Server Action 由 Next 内建保护。
- **输入**：Zod 限制 UUID、长度、枚举、JSON 大小；事件 8KB、状态/提交 64KB、笔记 64KB；事件限速 120 次/分钟/ enrollment。
- **XSS**：MDX 仅来自可信仓库；笔记使用 `markdown-it({ html: false })` 转义原始 HTML。
- **密钥**：service role key 只在服务端模块；`pnpm security:scan` 扫描 `.next/static`。
- **活动组件**：只允许 Registry 中经过审核的组件；Supabase 会话 Cookie 设置 `httpOnly`；活动只能调用受认证的同源 API。
- **响应**：统一错误码，不返回数据库堆栈；测验响应不含答案/解析。

## 10. 报表与轮询

- `/admin`、`/admin/students`、`/admin/courses`、`/admin/courses/[id]` 客户端每 30 秒 `router.refresh()`。
- 学生学习页在可见且聚焦时每约 60 秒发送心跳，并在页面重新可见/聚焦时补发。
- 统计在请求时从真实表计算：学生数、active enrollment、120 秒在线数、课程数、完成人次、最近活跃学生。
- 管理端列表支持分页、姓名/邮箱搜索、在线过滤；课程详情按 `active/completed/abandoned` 过滤。
- 管理员无法访问学生笔记（无接口、无 RLS 策略）。

## 11. 部署

生产部署是**单机 Docker Compose**，只有两个服务：

```text
web (Next.js standalone)  ── 3000/tcp（唯一对外端口）
updater (Node + Docker CLI) ── 无监听端口；轮询 Supabase 任务
        │
        ├── /var/run/docker.sock
        └── 项目目录挂载（固定快照、compose build/up）
```

- `Dockerfile`：`deps → tools → builder → runner`。`tools` 目标运行 `courses:prepare` / `courses:validate`，也供 updater 执行 `courses:snapshot`、`courses:preflight`、`courses:sync`。
- `docker-compose.yml`：`web` 发布 3000；`updater` 挂载 Docker Socket 与项目目录。服务端 Supabase 使用 `SUPABASE_INTERNAL_URL`（host gateway），浏览器仍用 `NEXT_PUBLIC_*`。
- 任务持久化：`deployment_jobs` 保存状态、阶段、日志、课程快照、镜像引用；`deployment_state` 保存当前/上一个成功版本。两者 RLS 开启且无浏览器策略，仅 service role 可访问。
- 更新顺序：固定源码快照 → tools 镜像校验 → `docker compose build web` → 保存旧镜像 → 兼容性检查 → `courses:sync` → `docker compose up -d --no-deps web` → 健康检查 → 记录成功版本。
- 失败处理：构建/校验/兼容性失败不替换容器；启动或健康检查失败自动恢复旧镜像。手动回滚前检查目标课程结构与数据库学习记录兼容性。
- 镜像只保留当前与上一个成功版本；部署版本为 `YYYY.MM.DD-NN`，不依赖 Git Commit。
- 数据库仍通过 Supabase CLI/迁移执行；Compose 不删除或重建课程/学习记录。
- 生产仍建议在 3000 前加 TLS 反向代理或只允许 VPN 访问；本仓库未执行云端托管部署。

## 12. 教学层与新版工作区

- **混合章节**：`ChapterLearningProvider` 持有一个 LearningClient 与整章 `{schemaVersion:2, blocks}` 状态；`BlockScope` 为每个 Concept/Simulation/KnowledgeCheck 提供 block-scoped SDK，状态按 `blockId` 合并保存。
- **概念层**：`lib/education/concepts.ts` 管理 `conceptId` 元数据；`components/concepts/registry.tsx` 按需加载概念动画；MDX 通过 `<ConceptPlayer>` 组合动画与文字，通过 `<MiniCheck>` 插入不计分知识检查。
- **章节 Block**：`SimulationBlock` 在章节内加载 Activity Registry；`KnowledgeCheck` 使用服务端题库评分；`ChapterProgress` 展示必需 Block 的通过状态和 all/any 规则。
- **动画控制**：`components/education/concept-frame.tsx` 统一播放/暂停/重播/单步/速度、类比边界、静态图解、键盘和 `prefers-reduced-motion`；状态写入 block 命名空间内的 `activity_states`，事件写入 `activity_events`。
- **学习工作区**：`components/learning/workspace.tsx` 在桌面提供可折叠目录、主内容、默认关闭的笔记抽屉与专注模式；移动端目录和笔记分别使用抽屉，内容优先。
- **连续学习**：`LessonPager` 提供上一节/下一节/课程完成入口；页头显示当前完成条件。
- **管理员**：`/admin/students/[id]` 为独立学生详情页，含概览、章节进度、学习时间线和成绩/积分四个标签页；课程详情学员表分页并在学生/课程之间互链。
- **管理数据**：列表与详情使用可见性感知的客户端轮询 + 请求序号保护；编辑弹窗/确认弹窗打开时暂停刷新；服务端概览通过 `AutoRefresh` 刷新。
- **元数据所有权**：manifest 拥有结构、题目、validator 与版本；`title`/`description` 创建后归管理员编辑，普通 `courses:sync` 不覆盖，只有 `--refresh-metadata` 显式覆盖。

### 12.1 页面职责

- `/courses`：学习入口与目录；只保留一个当前课程入口。
- `/courses/[slug]`：介绍、目标、章节预览、报名/恢复。
- `/learn/[courseId]`：沉浸式工作区（目录 + 内容 + 笔记抽屉 + 连续学习）。
- `/me`：个人历史、成绩、积分。
- `/admin`：整体监控、待关注学生。
- `/admin/students`：搜索、筛选、创建、分页；点击进入独立详情。
- `/admin/courses/[id]`：课程结构、学员分页与详情。

## 13. 课程插件与自动注册

- 每门课程是 `content/courses/<slug>/` 下的完整插件；唯一模型为 Course → Chapter（MDX）→ 可选 blocks/completion；`plugins` 声明 concept、activity 与 validator，路径/导出在生成期校验。
- MDX 使用 `remark-parse` + `remark-mdx` AST 校验，拒绝未注册组件、未声明/重复/类型不匹配的 Block；客户端组件禁止导入服务端 validator/题库。
- `scripts/courses/generate.ts` 扫描全部 Manifest，稳定排序生成 `lib/generated/course-catalog.ts`、`course-components.tsx`、`validator-registry.server.ts`；平台 Registry 只引用生成物。
- 新课程无需修改核心 Registry；删除课程会清除生成项。
- 旧课程用 `legacyGlobalId` 保留原 activity/concept ID 与历史数据；组件源码已迁入课程目录。
- Validator 指纹来自 validator 文件 SHA-256，由生成器输出；旧 `validatorHash` 在首次同步时兼容升级到版本 2 指纹。
- `pnpm courses:scan` / `pnpm courses:snapshot` 输出课程版本、源码摘要、结构摘要与插件清单；`/admin/deployments` 与 `updater` 使用同一套快照逻辑。
- Validator ID 全局唯一；组件/validator 路径解析真实路径，拒绝符号链接越出课程目录。
- 扫描与部署使用 `sourceDigest` + `structuralDigest` 比较；版本未变但源码变化会提示，结构变化且已有学习记录会阻止部署。
