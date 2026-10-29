# LearnOS — 互动式多人学习平台 MVP 实施规格 v1.0

> **2026-10-23 P1 修订**：课程模型已收敛为 `Course → Chapter（MDX）→ 可选 Block → 完成规则`。本文中关于 `interactive` / `quiz` Lesson 类型、`/api/learning/submissions`、`/api/quizzes/*` 与「必须存在最终测验」的描述已被 [`decisions.md`](decisions.md) D38 取代；数据库历史表与列保留以兼容既有学习记录。

> 用途：直接交给开发 Agent 实现。除「待扩展」项目外，本文是 MVP 的实现与验收基准。
>
> 核心目标：管理员创建学生账户；学生同一时间只能参与一门进行中的课程；学生学习图文、独立 JS 互动实验与测验，可做笔记；平台自动保存学习状态、课程进度、最后活跃时间并发放积分；管理员按学生和课程查看详细学习状态。

## 0. 冻结范围与原则

- 角色：`student`、`admin`；MVP 不开发讲师角色。
- 课程：不限时间、无截止日期；学生同时最多一条 `active` enrollment；允许主动退出课程，进度保留，重新参加同一课程时继续原进度；完成的课程可以复习。
- 内容类型：`article`（MDX）、`interactive`（独立 HTML/JS 应用）、`quiz`（服务端判分）。每个 Lesson 选择一种类型。
- 课程制作：MVP 采用 **内容即代码（content-as-code）**，开发者添加 `course.json`、MDX、原生互动组件、题库与校验器；执行同步脚本入库。管理员 UI 负责查看、发布/下架、编辑标题描述与管理学生；完整所见即所得编辑器延期。
- 互动组件由主应用内的 React Registry 加载；通过同源 Learning SDK 传递学习事件和状态；**所有带积分或通过状态的权威判定都由服务器执行**。
- 管理员进度监测按 30 秒轮询；学生学习页在可见且活动时约 60 秒发送心跳；不引入 WebSocket、Redis、队列和微服务。
- 评分：完成 Lesson 首次发放 10 分（参与性积分，仅一次）；通过课程最终测验额外发放 50 分（服务端验证，仅一次）。自报告互动完成存在可伪造风险，最终通过必须有服务端校验的测验。未来可切换为仅对验证性活动奖励。
- 统一错误码、Zod 校验、事务、幂等、RLS；所有记录时间用 UTC，前端以用户本地时间显示。

## 1. 技术架构

- Next.js App Router + TypeScript：页面、Route Handlers、业务服务。
- Tailwind CSS + shadcn/ui：学生与管理员组件，支持 light/dark；ASCII 主题可单独加入，不能影响业务。
- Supabase：Auth、PostgreSQL、Storage（图片/附件；不托管可执行 HTML）。
- MDX：由项目本地可信源代码编译，不运行不可信用户上传的任意 MDX。
- 原生互动组件：主应用内经过审核的 React/TypeScript 组件，可使用 SVG、Canvas、Three.js 等；通过 `activityId` 显式注册，不使用 iframe、postMessage 或独立 Labs 站点。
- 使用 `@supabase/ssr` 建立 Next.js 浏览器和服务端客户端；服务端校验身份、角色与资源归属；所有对外可访问表启用 RLS。
- UI 层不得持有 Supabase Secret Key 或评分答案。

### 1.1 核心分层

```
Next.js (student / admin)
  ├─ Auth guard + role guard
  ├─ Course player (MDX / native activity / quiz)
  ├─ Learning SDK (same-origin)
  └─ /api/** Route Handlers
       ├─ enrollment-service
       ├─ progress-service
       ├─ interaction-service + validators
       ├─ quiz-service
       ├─ points-service
       └─ reporting-service
                ↓
         Supabase PostgreSQL

Activity Registry (same-origin React)
  └─ LearningClient → authenticated /api/learning/**
```

## 2. 功能模块（准确范围）

| 编号 | 模块 | 学生功能 | 管理员功能 | 关键约束 |
|---|---|---|---|---|
| M01 | 账号与权限 | 登录、登出、查看个人资料 | 创建、停用学生账号、重置登录凭据 | 角色由服务端判定；禁用账号拒绝业务接口 |
| M02 | 课程 | 查看已发布课程、查看详情、参加 | 课程列表、编辑元数据、发布/下架 | 下架后禁止新参加；在学学生保留原记录，由管理员决定是否继续访问 |
| M03 | 学习引擎 | 单课程占用、章节导航、进度保存、退出与恢复 | 查看学生/课程进度 | 每人仅 1 条 active；退出不删历史；无自动超时结课 |
| M04 | 互动实验 | 打开原生互动组件、交互、步骤反馈、保存/恢复状态 | 查看最新步骤和关键事件 | 服务端 validator 判定；事件不可自行发放积分 |
| M05 | 测验 | 获取题目、提交、查看结果、重试 | 查看最高分与通过情况 | 题目答案仅在服务端；达标才完成；幂等提交 |
| M06 | 章节笔记 | 查看、编辑、自动保存自己的 Markdown 笔记 | 默认不读取学生私人笔记 | 每学生每章节一份，限制体积 |
| M07 | 积分 | 总积分、积分流水 | 查看学生积分 | ledger 唯一事件键；只能服务端写入 |
| M08 | 学习监控 | 查看自己的最近学习/历史 | 概览、学生列表/详情、课程学员名单、最近操作 | `active enrollment` 和 `online` 分开；online 为近 120 秒有效心跳 |

## 3. 页面路由

### 3.1 学生端（5 页面）

| URL | 内容 |
|---|---|
| `/login` | Supabase 邮箱密码登录。管理员初期用受控脚本或后台 API 发放账号，不开放自由注册。 |
| `/courses` | 课程目录；当前进行中的课程置顶；学习路线以摘要卡片展示进度与下一门，链接到路线图；已完成课程可复习。 |
| `/paths` | 学习路线列表：每条路线的难度、简介、进度与下一门。 |
| `/paths/[slug]` | 路线图：按推荐顺序把课程画成流程图，标出每门课的状态（已完成/进行中/已暂停/可参加/即将上线）、进度与入口；推荐顺序，不锁定。 |
| `/courses/[slug]` | 课程介绍、章节目录、参与/继续/复习/退出按钮；所在学习路线的位置（链接到路线图）与下一门课程。 |
| `/learn/[courseId]` | **唯一课程播放器页面**，选择章节用 `?lesson=<lessonId>`；左侧课程目录（单元可折叠，当前章节下内嵌本章大纲）、中央内容与笔记抽屉。 |
| `/me` | 个人账户、当前课程、历史完成课程、总积分与积分流水。 |

### 3.2 管理员端（4 页面）

| URL | 内容 |
|---|---|
| `/admin` | 学生总数、在学人数、近 120 秒在线人数、课程数、课程完成人次；最近活跃学生。 |
| `/admin/students` | 搜索、过滤学生；抽屉显示当前课程/章节、总进度、最近活跃、章节完成明细、最近事件、积分。 |
| `/admin/courses` | 查看课程、发布/下架、编辑标题/简介；内容由 Git/同步脚本管理。 |
| `/admin/courses/[id]` | 课程详情；`active/completed/abandoned` 学员筛选，显示学生、进度、当前章节、最后活跃。 |
| `/admin/courses/[id]/analytics` | 课程卡点分析（D63）：章节进入/完成与停留人数、实验与知识检查的通过情况、错得最多的题目及常选错误选项；只显示聚合数字。 |

## 4. 数据库表与约束

全部业务数据置于 PostgreSQL，Supabase Auth 的 `auth.users` 作为账号身份源。

### 4.1 实体表

1. `profiles`
   - `user_id uuid PK REFERENCES auth.users(id)`、`display_name text`、`role text CHECK IN ('student','admin')`、`disabled_at timestamptz NULL`、`created_at timestamptz`
2. `courses`
   - `id uuid PK`、`slug text UNIQUE`、`title text`、`description text`、`status text CHECK IN ('draft','published','archived')`、`content_version text`、`created_at`、`updated_at`
3. `lessons`
   - `id uuid PK`、`course_id uuid FK`、`slug text`、`title text`、`position integer`、`type text CHECK IN ('article','interactive','quiz')`、`required boolean DEFAULT true`、`content_ref text`、`completion_policy text CHECK IN ('manual','reported','server_validated')`、`config jsonb`、`UNIQUE(course_id,slug)`、`UNIQUE(course_id,position)`
4. `enrollments`
   - `id uuid PK`、`student_id uuid FK`、`course_id uuid FK`、`status text CHECK IN ('active','completed','abandoned')`、`current_lesson_id uuid NULL`、`started_at`、`last_seen_at timestamptz NULL`、`last_interaction_at timestamptz NULL`、`completed_at timestamptz NULL`、`updated_at`、`UNIQUE(student_id,course_id)`
5. `lesson_progress`
   - `enrollment_id uuid FK`、`lesson_id uuid FK`、`status text CHECK IN ('not_started','in_progress','completed')`、`completed_at timestamptz NULL`、`completion_source text NULL`、`PRIMARY KEY(enrollment_id,lesson_id)`
6. `activity_events`
   - `id uuid PK`（客户端生成用于幂等）、`enrollment_id uuid FK`、`lesson_id uuid FK`、`event_type text`、`step_id text NULL`、`payload jsonb`、`created_at timestamptz DEFAULT now()`；按时间与用户/课程建索引。
7. `activity_states`
   - `enrollment_id uuid FK`、`lesson_id uuid FK`、`state jsonb`、`version integer`、`updated_at`、`PRIMARY KEY(enrollment_id,lesson_id)`；乐观并发版本控制。
8. `activity_submissions`
   - `id uuid PK`（客户端提交请求 ID）、`enrollment_id uuid FK`、`lesson_id uuid FK`、`submission_hash text`、`passed boolean`、`feedback jsonb`、`created_at`。提交由服务器校验器判定，同一 ID 重试直接返回已存结果。
9. `quiz_attempts`
   - `id uuid PK`（客户端提交请求 ID，用于幂等）、`enrollment_id uuid FK`、`lesson_id uuid FK`、`score numeric`、`passed boolean`、`submitted_at`、`answer_summary jsonb`（仅存必要的脱敏记录）。
10. `notes`
   - `student_id uuid FK`、`lesson_id uuid FK`、`content text`、`updated_at`、`PRIMARY KEY(student_id,lesson_id)`。
11. `point_events`
   - `id uuid PK`、`student_id uuid FK`、`enrollment_id uuid FK`、`delta integer`、`reason text`、`dedupe_key text UNIQUE`、`created_at`。

### 4.2 必须落库的业务约束

```sql
CREATE UNIQUE INDEX one_active_enrollment_per_student
  ON enrollments(student_id)
  WHERE status = 'active';
```

- `UNIQUE(student_id,course_id)`：学生在同一门课仅保留一条累计学习记录。`abandoned → active` 时恢复原进度；`completed` 后可复习。
- 通过事务创建或恢复课程 enrollment；唯一索引冲突统一转 `409 ACTIVE_COURSE_EXISTS`。
- 章节完成、课程完成、积分事件的写入在同一数据库事务内完成；重复请求不重复发分。
- `last_seen_at` 表示心跳最近时间；`last_interaction_at` 表示最近明确学习操作，两者都展示，避免把打开但无人操作的浏览器判为认真学习。
- 课程进度 = 已完成必修 Lesson 数 ÷ 必修 Lesson 总数 × 100%，0 个必修章节禁止发布。
- `lesson_progress` 必须属于 enrollment 的同一 course，lesson 的题目与提交也必须属于当前授权 enrollment；在事务/服务端做跨表归属检查。
- 对于最后测验，必须 `passed = true` 才可设置 quiz lesson 为 completed。
- 完成全部必修章节（含验证通过的最终测验）后自动将 enrollment 改为 `completed`，释放单课程占用；无定时器自动完成。
- 课程 status 为 archived/draft 不允许新的 enrollment；已在学学生的访问策略需在代码中固定：建议 archived 禁止新入学、已有在学者可完成，draft 仅管理员预览。
- `notes` 不随退出课程删除。

## 5. REST API 契约

所有自建业务 API 前缀 `/api`，Next.js App Router `app/api/**/route.ts` 实现。全部请求/响应为 JSON；使用 Supabase SSR Cookie 登录会话；拒绝未登录/禁用账户；角色和资源归属在服务端检查。对于 POST/PUT/PATCH 严格做 Zod 校验与 CSRF/Origin 防护（浏览器 cookie 认证）。

### 5.1 统一响应形式

成功：

```json
{ "data": { "id": "..." } }
```

失败：

```json
{ "error": { "code": "ACTIVE_COURSE_EXISTS", "message": "请先完成或退出当前课程" } }
```

HTTP 状态约定：`400 BAD_REQUEST`，`401 UNAUTHENTICATED`，`403 FORBIDDEN`，`404 NOT_FOUND`，`409 CONFLICT`，`422 VALIDATION_ERROR`，`429 RATE_LIMITED`，`500 INTERNAL_ERROR`。不向客户端泄露内部错误堆栈。

### 5.2 学生接口

| 方法 | 路径 | 用途 | 输入/输出关键字段 |
|---|---|---|---|
| GET | `/api/me` | 当前账户 | `id, displayName, role, totalPoints` |
| GET | `/api/courses` | 已发布课程 | `items[{id,slug,title,description,lessonCount,myStatus,myProgress}]` |
| GET | `/api/courses/:slug` | 课程信息与目录 | `course, lessons[{id,title,type,position,required}],myEnrollment` |
| GET | `/api/enrollments/current` | 当前进行中课程 | `enrollment, lessonProgress, courseProgress`；无则 `data:null` |
| GET | `/api/enrollments/history` | 历史课程 | `items[{course,status,progress,startedAt,completedAt}]` |
| POST | `/api/enrollments` | 参加/恢复课程 | `{courseId}` → enrollment；已有其他 active 则 409；重复加入同课程应幂等 |
| POST | `/api/enrollments/:id/abandon` | 主动退出课程 | 空 body → `status:'abandoned'`；保留笔记和进度 |
| POST | `/api/learning/heartbeat` | 学习心跳 | `{enrollmentId, lessonId, visible, focused}` → `lastSeenAt`，仅认可当前 active |
| POST | `/api/learning/events` | 互动遥测事件 | `{id,enrollmentId,lessonId,type,stepId?,payload?}` → `accepted`; UUID 去重 |
| GET | `/api/learning/states/:lessonId` | 恢复互动状态 | `state,version,updatedAt`；仅有该课程学习权限 |
| PUT | `/api/learning/states/:lessonId` | 保存状态 | `{enrollmentId,state,expectedVersion}` → 新 `version`；冲突 409 |
| POST | `/api/learning/submissions` | 互动实验最终提交 | `{id,enrollmentId,lessonId,submission}` → `{accepted,passed,feedback}`；后端运行对应已注册校验器 |
| POST | `/api/lessons/:id/complete` | 完成图文章节或允许自报告的实验 | `{enrollmentId}` → `lessonStatus,courseProgress`；只允许声明相应策略的类型，幂等 |
| GET | `/api/quizzes/:lessonId` | 获取测验题目 | `questions`（无正确答案）、`passScore`；当前学生可学习时可用 |
| POST | `/api/quizzes/:lessonId/submit` | 提交测验并判分 | `{attemptId,enrollmentId,answers}` → `score,passed,feedback,courseProgress`; 服务端评分 |
| GET | `/api/notes/:lessonId` | 读取我的章节笔记 | `content,updatedAt` |
| PUT | `/api/notes/:lessonId` | 自动保存章节笔记 | `{content}` → `updatedAt`，最大 64KB |
| GET | `/api/me/points` | 查看积分记录 | `total,items[{delta,reason,createdAt}]` |

### 5.3 管理员接口

| 方法 | 路径 | 用途 | 输入/输出关键字段 |
|---|---|---|---|
| GET | `/api/admin/overview` | 概览 | `studentCount,activeEnrollmentCount,onlineCount,courseCount,completedEnrollmentCount,recentActivity` |
| GET | `/api/admin/students` | 学生列表/查询 | 查询 `q,online,courseId,page,pageSize` → `items[{id,name,activeCourse,currentLesson,progress,lastSeenAt,lastInteractionAt,points}]` |
| POST | `/api/admin/students` | 创建学生账号 | `{email,displayName,initialPassword}` → `id`；初始密码采用安全一次性配置/重置机制，正式环境优先邀请设置密码 |
| GET | `/api/admin/students/:id` | 单学生详情 | 账户、当前课程与章节、所有学习记录、各章节进度、最近 50 条事件、积分统计；不含私人笔记 |
| PATCH | `/api/admin/students/:id` | 停用/启用学生 | `{disabled:boolean,displayName?}`；仅 admin |
| POST | `/api/admin/students/:id/reset-password` | 发起密码重置 | 通过 Supabase Auth 发送重置邮件，不在响应暴露重置令牌；部署时配置邮件服务 |
| GET | `/api/admin/courses` | 全部课程列表 | 含草稿/已发布/已归档及参加人数 |
| GET | `/api/admin/courses/:id` | 课程详情及章节 | 课程、章节元数据、各状态人数 |
| PATCH | `/api/admin/courses/:id` | 更新元信息/发布状态 | `{title?,description?,status?}`；发布前验证课程结构、最终测验及必修章节 |
| GET | `/api/admin/courses/:id/students` | 课程学员名单 | 查询 `status,page,pageSize` → `items[{studentId,name,enrollmentStatus,progress,currentLesson,lastSeenAt,lastInteractionAt}]` |

> API 列表以此处为准。MVP 不提供自由上传并执行 JS、通用题库编辑器、课程删除接口、管理员手工改积分接口或学习笔记窥视接口。

### 5.4 关键交互示例

**参加课程**

```http
POST /api/enrollments
Content-Type: application/json

{"courseId":"00000000-0000-4000-8000-000000000001"}
```

返回：

```json
{
  "data": {
    "id": "11111111-1111-4111-8111-111111111111",
    "courseId": "00000000-0000-4000-8000-000000000001",
    "status": "active",
    "currentLessonId": null,
    "progress": 0
  }
}
```

如果已经在学习另一门课程，`HTTP 409`：

```json
{
  "error": {
    "code": "ACTIVE_COURSE_EXISTS",
    "message": "请先完成或退出当前课程"
  }
}
```

**互动事件**

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "enrollmentId": "11111111-1111-4111-8111-111111111111",
  "lessonId": "33333333-3333-4333-8333-333333333333",
  "type": "step_interacted",
  "stepId": "unsafe-query",
  "payload": { "variant": "concatenated", "attempt": 2 }
}
```

`activity_events` 记录事件，`last_interaction_at` 由后端更新时间，事件本身不授予通过或积分。

**保存与恢复**

```json
{
  "enrollmentId": "11111111-1111-4111-8111-111111111111",
  "expectedVersion": 3,
  "state": { "currentStep": "safe-query", "completedSteps": ["intro", "unsafe-query"] }
}
```

服务器返回 `version:4`。若别的标签页先保存导致版本不匹配则返回 `409 STATE_VERSION_CONFLICT`，前端重新获取并提示冲突或按照规则合并。

## 6. Learning SDK 与原生活动

### 6.1 内容实现方式

- `article`：受信任的仓库内 MDX，使用项目组件渲染。
- `interactive`：主应用内经过审核的 React/TypeScript 组件，manifest 只保存 `activityId`；组件通过显式 Registry 映射，不根据用户输入构造模块路径。
- `quiz`：题目客户端可见；正确答案与评分器留在服务端源码或数据库受限表中。

### 6.2 SDK 对课程开发者的接口

```ts
export interface LearningSDK {
  start(): void;
  track(type: string, payload?: Record<string, unknown>, stepId?: string): void;
  saveState(state: Record<string, unknown>): Promise<{ version: number }>;
  complete(stepId?: string): Promise<{ recorded: boolean }>;
  submit(submission: Record<string, unknown>): Promise<{ passed: boolean; feedback?: Record<string, unknown> }>;
}
```

含义：
- `start`：记录模块开始；可重复调用但按会话去重。
- `track`：上报交互遥测数据，限制事件类型和 payload 大小、节流；payload 完整持久化，但不得直接控制通过/积分。
- `saveState`：保存学生当前交互状态；防抖 0.5–1.0 秒，版本冲突返回 409，页面卸载时 best-effort flush。
- `complete`：报告完成步骤。对 `reported` 策略仅标记「自报告」；对 `server_validated` 策略不能绕过验证。
- `submit`：将互动结论提交服务端 validator，得到可验证的 pass/fail。
- 状态恢复通过 React Context/Hook 提供（服务端初始状态 + `refreshState`）；SDK 不依赖 iframe 握手。

### 6.3 同源安全边界

- 组件只来自 `components/activities/registry.tsx` 的显式注册；manifest 的 `activityId` 必须同时存在于 `lib/activities/catalog.ts`。
- 组件与主应用同源，只能通过受认证的 `/api/learning/**` 读写状态；服务端根据会话确定 student，逐请求校验 enrollment/lesson 归属。
- 不向组件下发 Supabase service role、管理员凭据或测验答案；会话 Cookie 设置 `httpOnly`。
- 事件只是客户端陈述；任何浏览器端 JS 都可以被用户伪造。积分和可信通过条件必须使用服务端判题/校验器；管理员 UI 要区分 reported/verified。
- 假设互动组件由平台团队开发并经代码审核。学生上传任意可执行 HTML 不属于 MVP。

### 6.4 课程文件与 manifest（内容即代码）

```text
content/
  courses/
    sql-basics/
      course.json
      intro.mdx
      principle.mdx
      quiz.server.json         # 答案仅服务端读取，严禁前端打包
      validators.ts            # 互动组件服务端验证器
components/activities/         # activityId registry 与原生组件
lib/activities/                # 纯模拟/校验逻辑与活动目录
```

示例 `course.json`：

```json
{
  "slug": "sql-basics",
  "title": "SQL 注入原理与防御",
  "description": "从字符串拼接到参数化查询",
  "version": "1.0.0",
  "lessons": [
    { "slug": "intro", "title": "基础概念", "type": "article", "source": "intro.mdx", "completionPolicy": "manual", "required": true },
    { "slug": "principle", "title": "工作原理", "type": "article", "source": "principle.mdx", "completionPolicy": "manual", "required": true },
    { "slug": "demo", "title": "模拟器", "type": "interactive", "activityId": "sql-injection-lab", "completionPolicy": "server_validated", "required": true },
    { "slug": "final-quiz", "title": "最终测验", "type": "quiz", "source": "quiz.server.json", "completionPolicy": "server_validated", "required": true }
  ]
}
```

- `pnpm courses:validate` 验证 schema、顺序、唯一 slug、资源可用性、必修数、最终题目与 activityId/validator 引用。
- `pnpm courses:sync` 将 manifest 元数据写入 courses、lessons（upsert）；不覆盖管理员维护的发布状态；更新 `content_version`。已存在 enrollment 的课程拒绝改变课程结构（必修集合、章节 ID 和顺序）；结构性升级发布新 slug。
- 发布前验证课程；已入学课程的章节结构、题库内容与 validator 源码必须保持冻结。MVP 允许修正文案；涉及必修章节增删、顺序调整、题目或评分规则变化时发布新 course slug，避免历史进度失真。

### 6.5 混合内容与概念动画

- 一个 article 章节的 MDX 可以按顺序组合文字、`ConceptPlayer`、`Callout`、`MiniCheck` 等可信组件；不新增数据库表，不改变旧章节读取。
- `ConceptPlayer` 通过稳定 `conceptId` 引用 `lib/education/concepts.ts` 注册的概念，组件按需加载；`blockId` 标识章节内的教学块。
- 概念动画必须支持播放/暂停/重播/上一步/下一步/速度、步骤说明、静态图解和 `prefers-reduced-motion`；动画播放、知识检查不计分。
- 学习状态与事件通过同源 Learning SDK 持久化；事件只是遥测，不能替代服务端正式测验/validator。
- 可选 `unit` 只作为 manifest 的逻辑分组，同步到 `lessons.config.unit`，不增加表；不参与结构冻结。

## 7. 权限矩阵和数据安全

| 资源 | student | admin |
|---|---|---|
| 已发布课程基本信息 | read | read/write 元信息与状态 |
| 自己的 enrollments / progress | read，受控状态转换 | read all |
| 其他学生的进度 | deny | read |
| 自己的 notes | read/write | 默认 deny |
| 其他人的 notes | deny | 默认 deny |
| events / states | 自己 active 课程范围内受控提交 | read statistics/recent events |
| quiz answers / validators | deny | 仅服务端代码/受限数据源，不经一般 API 暴露 |
| point_events | read own | read all；只能由后端写 |
| profile 角色 | read own | 只能通过受控管理操作修改（MVP 不能提升 admin） |

关键要求：
1. 服务端以 Supabase 校验后的身份确定 `student_id`；忽略客户端自报用户 ID。
2. 启用 RLS 并对每张暴露表编写 `anon`、`authenticated` 的操作测试；拒绝浏览器直接写 `lesson_progress`、`point_events` 或评分状态。
3. 管理员写接口通过服务端校验角色后调用受权限控制的数据库逻辑；Secret Key 只在服务端环境存在。
4. 登录会话安全、HTTP cookie 安全属性、CSRF/Origin 检查；限制事件频率、payload 与笔记大小，防止膨胀。
5. 管理员账户由初始化脚本创建；创建学生不能通过自报 role 提升权限；修改 role 的 API MVP 不开放。
6. 不将用户提供的 Markdown/HTML 作为可信 MDX 编译；笔记渲染使用安全的 Markdown renderer，禁用危险 HTML。

## 8. 关键业务状态机与规则

### 8.1 Enrollment

```
none --join--> active --finish--> completed
                  |
                  +--abandon--> abandoned --resume--> active
completed --review--> readonly player (不占 active 名额)
```

- `join` 同一课程已 active：返回已有 enrollment，不新建；其他 active：409。
- `abandon` 后恢复时恢复笔记、lesson_progress、互动状态。
- 上下文需要课程归属，所有 endpoint 以已认证学生及 enrollment ownership 验证。
- `completed` 进入只读复习模式：可阅读内容和旧笔记，但不再重新发放奖励；如需编辑笔记可放开笔记权限，不修改历史进度。

### 8.2 Lesson

```
not_started → in_progress → completed
```

- Article：用户明确点击完成；标记 `completion_source = manual`。
- Interactive：`reported` 允许由 `complete()` 自报告；`server_validated` 必须 validator 返回 passed 才标记；遥测事件独立保存。
- Quiz：达到 `passScore` 才完成。每次提交生成 attempt（按 `attemptId` 幂等），失败可重试；只记第一次通过后的奖励。
- `lesson_progress` 由服务器按照课程版次与策略判断；若全部 required Lessons completed，enrollment 在同事务变为 completed。

### 8.3 在线与活跃

- `enrollment.status = active`：课程正在进行中，可能离线。
- `is_online = active AND now - last_seen_at <= 120秒`：最近有页面心跳。
- `last_interaction_at`：实际点击、答题、实验事件或笔记编辑等有效操作时间。
- 心跳只能由可见页面持续上报，不代表用户理解或真实注意力；后台名称为「最近在线」和「最近交互」。

## 9. 实施顺序

### Phase 0 — 工程基础
- Next.js、TypeScript、shadcn/ui、Supabase 客户端、环境变量、数据库迁移、RLS/权限测试、管理账号初始化、基础测试工具。
- 完成自动化构建 `lint`、`typecheck`、`test`、`build`。

### Phase 1 — 闭环必需
- 登录与角色；课程目录/详情；内容同步脚本；开始/退出/恢复课程（DB 唯一约束）；文章学习和进度；管理员总览与学生列表。
- 首先用 2 个测试学生执行并发参加课程测试。

### Phase 2 — 内容交互
- MDX 渲染；原生 React 互动组件；同源 Learning SDK；event/state API；服务端 validator；自动保存和恢复；互动状态显示。

### Phase 3 — 成果评估
- 题目获取、服务端判题、重试、积分 ledger、笔记自动保存；课程完成触发；管理员查看课程学员名单和学生详情。

### Phase 4 — 整体交付
- 两门完整演示课程（每门含 article、interactive、quiz，至少一个可验证互动）。
- E2E、并发、权限、RLS、数据恢复测试；README、`.env.example`、`AGENTS.md`、`docs/architecture.md`、`docs/api.md`、`docs/course-authoring.md`。

## 10. 必须通过的验收测试

1. 管理员创建账号，学生使用初始凭据完成登录；学生无法访问 `/admin` 和 `/api/admin/**`。
2. 两个浏览器同时提交报名不同课程，数据库最终只允许同一学生一个 active enrollment；冲突响应 409。
3. 同一课程重复报名返回原 enrollment；退出再恢复保留 Lesson、互动状态与笔记。
4. 无截止日期；离线超过 2 分钟显示不在线，但 enrollment 仍 active。
5. 管理员可以查到一个学生的当前课程、章节、课程进度、最后在线、最近交互、已完成章节，以及近期事件。
6. 管理员可以查看某课程 `active/completed/abandoned` 学生名单，各自进度和最近在线。
7. 独立互动实验能发送事件，保存状态，刷新后恢复；来源不匹配、nonce 错误、数据超限消息被拒绝。
8. 伪造 `complete` 或 HTTP `events` 不得通过 `server_validated` 章节，不得直接增加积分。
9. 学生提交最终测验，服务器给分；答案不会出现在客户端网络响应或打包资源；达到阈值才能完成。
10. 同一 lesson 完成请求、同一 attemptId 测验提交和同一 eventId 事件重试均保持幂等；积分不重复。
11. 全部必修章节完成后课程变为 completed，允许参加新课程，旧课程可复习。
12. 自己能读写自己笔记，其他学生无法读取，管理员默认不可查看；学生无法改其他人进度或积分。
13. 同一账号快速连续使用多标签保存状态时有版本冲突保护，无静默数据覆盖。
14. 两门演示课程均能从报名完整走通讲解 → 互动 → 测验 → 结课 → 积分 → 管理员查看。
15. `lint`、`typecheck`、`test`、`build` 全通过；敏感密钥未进入浏览器包和 Git；RLS 权限测试通过。

## 11. 不实施的功能（防止范围膨胀）

自由学生注册、社交、聊天、排行榜、证书、AI 老师、班级编组、教师角色、协作白板、WebSocket 实时推送、通知中心、排行榜、在线靶机容器、复杂考试监考、可视化课程编辑器、SCORM/LTI 全量兼容、学生自主上传并执行任意 JS。

## 12. 给开发 Agent 的直接任务

请在现有仓库（如果空仓则初始化新仓）按本规格构建可运行、可验证的 LearnOS MVP：

1. 将本文作为唯一业务规格，先列出完整实施计划与任务依赖，再直接逐阶段编码。
2. 严格使用 Next.js App Router + TypeScript + shadcn/ui + Supabase Postgres/Auth；Route Handlers、RLS、Zod、内容即代码方式落地。
3. 每个阶段完成可运行的功能、数据库迁移、测试和必要文档；完成当前验收再进入下一阶段。
4. UI 保持简洁，优先桌面端可用，同时在窄屏不溢出；支持浅色/深色主题。
5. 优先让学员的「参加 → 学习 → 互动 → 测验 → 结课」闭环真实跑通，同时让管理员准确看到数据。
6. 所有涉及权限、积分、认证、评分、课程唯一占用和活动注册/状态保存的规则必须经过自动化测试。
7. 课程作者应可以独立编写 React 互动组件，只要遵循 activityId 注册与 SDK 契约；首批实现两个可恢复、可追踪、可由服务端判定通过的实验。
8. 遇到业务规格未定义的细节，选择实现成本最低且符合安全约束的方案，写入 `docs/decisions.md`；不增加本规格明确延期的功能。
9. 最终交付可复制的本地启动步骤、环境变量说明、初始化管理员方法、两门种子课程、E2E 验收结果及剩余已知限制。
