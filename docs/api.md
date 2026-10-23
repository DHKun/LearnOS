# LearnOS REST API

> 契约依据 [`MVP-SPEC.md`](MVP-SPEC.md) 第 5 节。所有接口均为同源 JSON 请求，使用 Supabase SSR Cookie 会话。

## 0. 通用约定

- 成功：`{ "data": ... }`；失败：`{ "error": { "code": "...", "message": "..." } }`。
- 未登录 `401 UNAUTHENTICATED`；停用账号 `403 ACCOUNT_DISABLED`；角色不符 `403 FORBIDDEN`。
- 写请求（POST/PUT/PATCH/DELETE）必须携带与本应用一致的 `Origin`，否则 `403 CSRF_ORIGIN_REJECTED`。
- 客户端自报的 `studentId` / `role` 一律忽略；用户身份由 Cookie 会话确定。
- 所有时间为 UTC ISO 8601，浏览器本地化展示。
- 请求体上限 256KB；事件 `payload` 8KB、实验状态/提交 64KB、笔记 64KB。

HTTP 状态：`400 BAD_REQUEST`、`401 UNAUTHENTICATED`、`403 FORBIDDEN`、`404 NOT_FOUND`、`409 CONFLICT`、`422 VALIDATION_ERROR`、`429 RATE_LIMITED`、`500 INTERNAL_ERROR`。

常见业务错误码：

| code | HTTP | 含义 |
| --- | --- | --- |
| `ACTIVE_COURSE_EXISTS` | 409 | 已有另一门进行中的课程 |
| `COURSE_NOT_AVAILABLE` | 409 | 课程为 draft/archived，禁止新报名 |
| `ENROLLMENT_NOT_ACTIVE` | 409 | 只读复习或已退出，不能写入 |
| `STATE_VERSION_CONFLICT` | 409 | 实验状态版本冲突 |
| `SERVER_VALIDATION_REQUIRED` | 400 | 该实验必须服务端验证 |
| `QUIZ_REQUIRES_SUBMISSION` | 400 | 测验不能直接标记完成 |
| `PAYLOAD_TOO_LARGE` / `NOTE_TOO_LARGE` | 422 | 超过大小限制 |
| `RATE_LIMITED` | 429 | 遥测事件超过 120 次/分钟/ enrollment |
| `IDEMPOTENCY_KEY_REUSED` | 409 | 同一 submission/attempt ID 携带了不同内容 |

## 1. 学生接口（18 个方法）

### 1.1 当前账户

`GET /api/me` → `{ id, email, displayName, role, totalPoints }`

### 1.2 课程目录

`GET /api/courses` → `{ items: [{ id, slug, title, description, lessonCount, status, myStatus, myProgress }] }`

- 仅返回 `published` 课程。
- `myStatus`: `active | completed | abandoned | null`；`myProgress`: `{ total, completed, percent } | null`。

### 1.3 课程详情

`GET /api/courses/:slug` → `{ course, lessons, myEnrollment, myLessonProgress }`

- `lessons`: `{ id, slug, title, type, position, required, completionPolicy, unit?, activityId? }`。
- 非 published 课程只有已报名学生可读。
- `activityId` 只对交互章节返回。

### 1.4 当前进行中的课程

`GET /api/enrollments/current` → `data: null` 或：

```json
{
  "enrollment": { "id": "...", "courseId": "...", "status": "active", "currentLessonId": "...",
    "startedAt": "...", "lastSeenAt": "...", "lastInteractionAt": "...", "completedAt": null,
    "progress": { "total": 4, "completed": 1, "percent": 25 } },
  "course": { "id": "...", "slug": "...", "title": "...", "description": "...", "status": "published" },
  "lessons": [],
  "lessonProgress": { "<lessonId>": { "status": "completed", "completedAt": "..." } },
  "courseProgress": { "total": 4, "completed": 1, "percent": 25 }
}
```

### 1.5 历史课程

`GET /api/enrollments/history` → `{ items: [{ enrollmentId, course, status, progress, startedAt, completedAt }] }`

### 1.6 参加 / 恢复课程

`POST /api/enrollments` body `{ "courseId": "uuid" }`

- 返回 `EnrollmentSummary`（含 `id, courseId, status, currentLessonId, progress`）。
- 同课程重复报名或恢复 `abandoned` 返回原记录；`completed` 原样返回供复习。
- 已有其他 `active` → `409 ACTIVE_COURSE_EXISTS`。
- 课程非 published（新报名）→ `409 COURSE_NOT_AVAILABLE`。

### 1.7 退出课程

`POST /api/enrollments/:id/abandon` body `{}`

- 返回更新后的 enrollment（`status: "abandoned"`）；进度、事件、状态和笔记保留。

### 1.8 学习心跳

`POST /api/learning/heartbeat` body：

```json
{ "enrollmentId": "uuid", "lessonId": "uuid|null", "visible": true, "focused": true }
```

返回 `{ lastSeenAt, lastInteractionAt, currentLessonId, status }`。

- 仅 `active` enrollment 可用。
- 心跳更新 `last_seen_at`；仅当章节变化且页面可见/聚焦时更新 `last_interaction_at`。

### 1.9 互动遥测事件

`POST /api/learning/events` body：

```json
{ "id": "uuid", "enrollmentId": "uuid", "lessonId": "uuid",
  "type": "step_interacted", "stepId": "intro", "payload": { "attempt": 2 } }
```

返回 `{ accepted: true, duplicate: boolean }`。同一 `id` 重放不新增行；不发放积分。

### 1.10 读取实验状态

`GET /api/learning/states/:lessonId` → `{ state, version, updatedAt }`

- 无保存记录时 `{ state: null, version: 0, updatedAt: null }`。
- 无该课程学习记录 → `403 FORBIDDEN`。

### 1.11 保存实验状态

`PUT /api/learning/states/:lessonId` body：

```json
{ "enrollmentId": "uuid", "state": { "step": "two" }, "expectedVersion": 1 }
```

返回 `{ version, updatedAt }`。版本不匹配 → `409 STATE_VERSION_CONFLICT`。

### 1.12 提交互动实验

`POST /api/learning/submissions` body：

```json
{ "id": "uuid", "enrollmentId": "uuid", "lessonId": "uuid", "submission": { } }
```

返回 `{ accepted, duplicate, passed, feedback, lessonStatus, courseProgress, pointsAwarded? }`。

- 仅 `server_validated` 交互章节；服务端验证器判定。
- 同一 `id` 重放返回首次结果，不重复发分。
- 通过时首次完成章节 +10。

### 1.12.1 提交章节 Block（Manifest v3）

`POST /api/learning/blocks/submit` body：

```json
{
  "attemptId": "uuid",
  "enrollmentId": "uuid",
  "lessonId": "uuid",
  "blockId": "methods-check",
  "submission": { "answers": { "q1": "post" } }
}
```

返回：

```json
{
  "accepted": true,
  "duplicate": false,
  "passed": true,
  "score": 100,
  "feedback": {},
  "blockStatus": "passed",
  "chapterCompletionSatisfied": true,
  "chapterCompleted": true,
  "lessonStatus": "completed",
  "courseProgress": { "total": 9, "completed": 5, "percent": 56 },
  "enrollmentStatus": "active",
  "pointsAwarded": 10
}
```

- 仅 `article` 章节中声明过的 `simulation` / `question` Block。
- `submission` 对 simulation 是实验参数；对 question 是 `{ "answers": {...} }`，支持 single/multiple/boolean。
- 服务端重新运行 validator 或题库评分；`passed` 由服务端计算，客户端额外传 `passed` 字段会被 Zod 拒绝（422）。
- `attemptId` 幂等；同一 ID 不同请求内容 → `409 IDEMPOTENCY_KEY_REUSED`。
- `all` / `any` 条件满足时在同一事务完成章节并发放首次 +10；多个 Block 只发一次章节积分。
- 不存在的 Block → `404 BLOCK_NOT_FOUND`；类型不匹配 → `400 BLOCK_KIND_MISMATCH`。

### 1.13 完成章节

`POST /api/lessons/:id/complete` body `{ "enrollmentId": "uuid" }`

返回 `{ lessonStatus, courseProgress, enrollmentStatus, pointsAwarded, alreadyCompleted }`。

- 图文章节（manual）或 reported 交互章节；幂等。
- 测验 → `400 QUIZ_REQUIRES_SUBMISSION`；server_validated interactive → `400 SERVER_VALIDATION_REQUIRED`。
- v3 混合章节的 `all/any` 完成规则 → `400 COMPLETION_NOT_ALLOWED`，必须通过 Block 提交接口。

### 1.14 获取测验

`GET /api/quizzes/:lessonId` → `{ lessonId, title, passScore, questions }`

```json
{ "questions": [{ "id": "q1", "prompt": "...", "type": "single",
  "options": [{ "id": "a", "label": "..." }] }] }
```

- 绝不包含 `answer` 或 `explanation`。
- 需要该课程的 enrollment（active 或 completed）。

### 1.15 提交测验

`POST /api/quizzes/:lessonId/submit` body：

```json
{ "attemptId": "uuid", "enrollmentId": "uuid", "answers": { "q1": "b", "q2": ["a", "c"] } }
```

返回：

```json
{ "attemptId": "...", "score": 80, "passed": true, "correctCount": 4, "questionCount": 5,
  "passScore": 70, "duplicate": false, "courseProgress": { "total": 4, "completed": 4, "percent": 100 },
  "lessonStatus": "completed", "enrollmentStatus": "completed", "pointsAwarded": 60 }
```

- 服务端评分；达到 `passScore` 才完成章节。
- 失败可重试；同一 `attemptId` 幂等。
- 首次通过章节 +10；`finalExam` 首次通过额外 +50。
- 全部必修完成后 enrollment 变 `completed`。

### 1.16 读取笔记

`GET /api/notes/:lessonId` → `{ content, updatedAt }`。

### 1.17 保存笔记

`PUT /api/notes/:lessonId` body `{ "content": "markdown" }`

返回 `{ content, updatedAt }`。最大 64KB；仅本人可读写；需要该课程的 enrollment。

### 1.18 积分流水

`GET /api/me/points` → `{ total, items: [{ id, delta, reason, createdAt }] }`

`reason`: `lesson_completed`（+10）、`final_quiz_passed`（+50）。

## 2. 管理员接口（10 个方法）

所有接口要求 `admin` 角色且账号未停用。

### 2.1 概览

`GET /api/admin/overview` →

```json
{ "studentCount": 2, "activeEnrollmentCount": 1, "onlineCount": 1,
  "courseCount": 2, "publishedCourseCount": 2, "completedEnrollmentCount": 0,
  "recentActivity": [{ "studentId": "...", "name": "...", "courseTitle": "...",
    "currentLessonTitle": "...", "progress": 50, "lastSeenAt": "...",
    "lastInteractionAt": "...", "online": true }] }
```

### 2.2 学生列表 / 搜索

`GET /api/admin/students?q=&online=true|false&courseId=<uuid>&page=1&pageSize=20`

→ `{ items: [{ id, name, email, disabled, activeCourse, currentLesson, progress,
enrollmentStatus, lastSeenAt, lastInteractionAt, online, points }], total, page, pageSize }`

### 2.3 创建学生

`POST /api/admin/students` body `{ email, displayName, initialPassword }` → `{ id }`

- 只能创建 `student`；邮箱已存在 → `409 EMAIL_EXISTS`。
- 初始密码至少 8 位、最多 72 位。

### 2.4 学生详情

`GET /api/admin/students/:id` →

```json
{ "student": { "id", "name", "email", "disabled", "createdAt", "points" },
  "current": { "enrollmentId", "status", "courseId", "courseTitle", "courseSlug",
    "currentLesson", "progress", "startedAt", "lastSeenAt", "lastInteractionAt",
    "completedAt", "online" } | null,
  "history": [], "lessons": [], "recentEvents": [], "pointEvents": [] }
```

- `recentEvents` 最多 50 条；**不包含私人笔记**。

### 2.5 停用 / 启用学生

`PATCH /api/admin/students/:id` body `{ "disabled": true, "displayName?": "..." }` → `{ ok: true, id }`

停用后业务接口立即返回 `403 ACCOUNT_DISABLED`；登录也会被拒绝。

### 2.6 发起密码重置

`POST /api/admin/students/:id/reset-password` body `{}` → `{ sent: true }`

- 通过 Supabase Auth 发送重置邮件；响应不包含重置令牌。
- 本地环境可在 Mailpit（http://127.0.0.1:54324）查看。

### 2.7 全部课程

`GET /api/admin/courses` → `{ items: [{ id, slug, title, description, status, contentVersion,
lessonCount, enrollmentCount, activeCount, completedCount }] }`

### 2.8 课程详情

`GET /api/admin/courses/:id` → `{ course, lessons, counts: { active, completed, abandoned } }`

### 2.9 更新课程元信息 / 发布状态

`PATCH /api/admin/courses/:id` body `{ title?, description?, status? }` → `{ ok: true, id }`

- 发布前校验：至少 1 个必修章节、最后一个必修章节为 `finalExam` 测验、交互章节 validator 已注册、文章/测验有内容资源。
- 状态：`draft | published | archived`。

### 2.10 课程学员名单

`GET /api/admin/courses/:id/students?status=active|completed|abandoned&page=1&pageSize=50`

→ `{ items: [{ studentId, name, email, enrollmentId, enrollmentStatus, progress,
currentLesson, lastSeenAt, lastInteractionAt, online }], total, page, pageSize }`

### 2.11 部署概览

`GET /api/admin/deployments` → `{ state, current, previous, active, history, scan }`

- `state`: `{ currentVersion, previousVersion, currentJobId, previousJobId, currentImageId, previousImageId, updatedAt }`
- `current` / `previous`: 成功部署任务（含课程快照与结果）；`active`: 进行中任务（含实时日志）；`history`: 最近 20 条任务摘要（不含日志正文）。
- `scan`: 与 `GET /api/admin/deployments/scan` 相同。
- 仅管理员；学生/匿名 `403 FORBIDDEN`。

### 2.12 扫描本地课程

`GET /api/admin/deployments/scan` → `{ scannedAt, baselineVersion, baselineDeploymentId, items, failures, counts, canDeploy, blockingReasons }`

- 只读取服务器本地 `content/courses/`，不触发构建、不访问 Git。
- `items[].status`: `new | updated | latest | conflict | scan_failed | removed`。
- 每个 item 含 `version`、`sourceDigest`、`structuralDigest`、`lessons`、`concepts`、`activities`、`files` 摘要与 `changes: { added, modified, removed }`。
- 版本号未变但源码变化 → `updated` + warning；结构变化且已有 enrollment → `conflict`，`canDeploy=false`。

### 2.13 创建部署 / 回滚任务

`POST /api/admin/deployments` body `{ "action": "deploy" }` 或 `{ "action": "rollback", "targetJobId?": "uuid" }`

→ `202` + 任务对象。

- 同一时间只允许一个活动任务；重复请求 → `409 DEPLOYMENT_IN_PROGRESS`。
- 扫描存在冲突/失败 → `409 DEPLOYMENT_CONFLICT`。
- 没有上一成功版本 → `409 DEPLOYMENT_NOT_AVAILABLE`。
- 任务由 `updater` 异步执行；Web 只写任务与读取状态，不执行构建。

### 2.14 任务详情

`GET /api/admin/deployments/:id` → 任务对象（含 `logs`、`courses`、`result`、`error`）。

### 2.15 健康检查

`GET /api/health` → `{ status: "ok", version, builtAt, now }`

- 公开、无数据库查询；用于 Compose/updater 判断新容器是否已就绪。
- `version` 来自镜像构建参数 `LEARNOS_BUILD_VERSION`，updater 用它确认不是旧容器在响应。

### 2.16 部署任务内部存储

`deployment_jobs` / `deployment_state` 仅 service role 可读写，RLS 无浏览器策略。updater 通过 Supabase REST（service role）领取任务、追加日志、调用 `promote_deployment` / `promote_rollback` / `finish_deployment_failure`。这些不是公开 API，页面不得直接暴露 service role。

## 3. 未提供的接口（明确不在 MVP）

自由注册、管理员改积分、课程删除、题库编辑、笔记窥视、任意 HTML/JS 上传、通用文件上传、任意 Shell 命令执行。
