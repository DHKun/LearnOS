# LearnOS 架构与安全设计

> 本文描述实现层面的结构与约束。业务定义以 [`MVP-SPEC.md`](MVP-SPEC.md) 为准。

## 1. 运行时拓扑

```text
浏览器（学生 / 管理员）
  ├── Next.js App Router 页面（Server Components）
  ├── 客户端组件：播放器交互、笔记、实验桥、管理端抽屉
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

独立域名静态实验（localhost:4310 / labs.example.net）
  └── Learning SDK —— postMessage —— 父窗口实验桥 —— 同源 /api
```

- 单 Next.js 项目同时承担页面与 REST API；没有独立后端、消息队列、Redis 或 WebSocket。
- 实验站点与主站**不同源**，由 `scripts/serve-labs.mjs` 或任意静态主机托管。
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

## 3. 数据模型（11 张业务表）

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

`profiles.email` 为便于管理端展示而冗余保存（见 [`decisions.md`](decisions.md)）。

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
| `complete_lesson` | 图文章节/reported 实验完成、首次 +10、结课判定 |
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

- `article`：学生明确点击「标记本章完成」，来源 `manual`。
- `interactive`：
  - `reported`：允许 `complete()` 自报告；
  - `server_validated`：只有注册验证器返回 `passed=true` 才能完成；
  - 遥测事件独立保存，不影响通过。
- `quiz`：服务端评分达到 `passScore` 才完成；失败可重试；同一 `attemptId` 幂等。

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
  ├── quiz.server.json         → 仅服务端读取；API 去除 answer/explanation
  └── validators.ts            → 静态注册到 lib/content/validators.server.ts

pnpm courses:validate → 结构/资源/题库/validator/entryUrl 校验
pnpm courses:sync     → upsert courses/lessons；有 enrollment 时冻结结构
```

- 数据库保存 `content_ref`（文件相对路径）与 `config`（entryUrl/validatorId/passScore/finalExam）。
- 测验题目在请求时从服务端文件读取并评分；答案不进入数据库、API 响应或客户端 bundle。
- 实验 `entryUrl` 在同步时解析 `${LABS_ORIGIN}` 占位符并写入数据库；部署换域名后需重新同步。

## 8. iframe 与 Learning SDK 协议

1. 父窗口从服务端读取实验状态，渲染 `iframe`（`sandbox="allow-scripts allow-same-origin"`，不同源）。
2. SDK 读取 `parentOrigin` 查询参数，向父窗口发送 `READY`。
3. 父窗口校验 `origin`、`source`、协议、schema 后，创建随机 nonce 并发送 `INIT`（lessonId、主题、恢复状态、`readOnly`）。**不发送登录令牌、管理员凭据或答案。**
4. SDK 方法映射：

| SDK | 父窗口动作 |
| --- | --- |
| `start()` | `TRACK session_start`（会话内去重） |
| `track()` | `POST /api/learning/events`，客户端事件 UUID 幂等 |
| `saveState()` | 600ms 防抖 → `PUT /api/learning/states/:lessonId`，版本冲突回传错误 |
| `complete()` | `POST /api/lessons/:id/complete`；`server_validated` 返回 `recorded:false` |
| `submit()` | `POST /api/learning/submissions`，服务端验证器判定 |
| `onRestore()` | 使用 `INIT` 中的持久化状态 |

5. 所有子窗口消息必须包含 `protocol: learnos/1`、nonce、UUID requestId；父窗口维护已处理 requestId 集合防重放，并使用具体 `targetOrigin`（从不使用 `*`）。

## 9. 安全控制

- **身份**：Supabase Cookie 会话；服务端 `auth.getUser()`；角色来自 `profiles`；禁用账号在每个请求重新检查。
- **RLS**：11 张表全部启用；学生仅读自己（课程目录/章节按已发布或已报名），管理员读全部；`notes` 仅本人；浏览器角色无写权限（`REVOKE`），仅可写自己的 notes。
- **写入**：进度/积分/测验只能经 service-role 事务函数；浏览器无法直接写 `lesson_progress`、`point_events`、`quiz_attempts`。
- **CSRF**：写请求校验 Origin；Server Action 由 Next 内建保护。
- **输入**：Zod 限制 UUID、长度、枚举、JSON 大小；事件 8KB、状态/提交 64KB、笔记 64KB；事件限速 120 次/分钟/ enrollment。
- **XSS**：MDX 仅来自可信仓库；笔记使用 `markdown-it({ html: false })` 转义原始 HTML。
- **密钥**：service role key 只在服务端模块；`pnpm security:scan` 扫描 `.next/static`。
- **iframe**：独立源、最小 sandbox、严格 postMessage 校验、具体 targetOrigin。
- **响应**：统一错误码，不返回数据库堆栈；测验响应不含答案/解析。

## 10. 报表与轮询

- `/admin`、`/admin/students`、`/admin/courses`、`/admin/courses/[id]` 客户端每 30 秒 `router.refresh()`。
- 学生学习页在可见且聚焦时每约 60 秒发送心跳，并在页面重新可见/聚焦时补发。
- 统计在请求时从真实表计算：学生数、active enrollment、120 秒在线数、课程数、完成人次、最近活跃学生。
- 管理端列表支持分页、姓名/邮箱搜索、在线过滤；课程详情按 `active/completed/abandoned` 过滤。
- 管理员无法访问学生笔记（无接口、无 RLS 策略）。

## 11. 部署

- 应用：`pnpm build` + `pnpm start`（或容器镜像），配置服务端环境变量；迁移通过 Supabase CLI/CI 执行。
- 实验：`apps/labs` 作为静态站点部署到独立域名，SDK 由 `pnpm labs:build` 生成。
- 数据库：Supabase 托管或本地 Docker；所有迁移可重复执行。
- 生产需配置 SMTP、Cookie 安全属性、反向代理与独立实验域名；本仓库未执行云端部署。
