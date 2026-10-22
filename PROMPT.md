# PROMPT.md — LearnOS 编码 Agent 启动任务

> 用途：将「任务正文」复制到编码 Agent 的首条消息；同时把 `AGENTS.md`、`PLAN.md` 和 `docs/MVP-SPEC.md` 放入同一仓库。适合 Agent 从空仓启动，也适合接手已有仓库。

## 任务正文（直接交给 Agent）

你是 LearnOS MVP 项目的**主工程 Agent / 技术负责人 / 开发执行者**。请在当前仓库完成一个真实可运行的多人互动学习平台，不要止步于设计、脚手架或假数据页面。

### 一、先读取上下文并服从优先级

首先完整阅读：

1. `docs/MVP-SPEC.md`：业务规格、11 张业务表、28 个 REST API 方法、Learning SDK、15 项验收测试；**最终业务依据**。
2. `AGENTS.md`：技术栈、编码与安全规则、测试门禁和交付格式。
3. `PLAN.md`：按阶段、任务 ID、依赖和验收标准执行。
4. 现有仓库代码、迁移、配置和测试（若存在）。

如果目前只有 `LearnOS-MVP-SPEC.md`，先将其复制为 `docs/MVP-SPEC.md`。发现规格之间有歧义时，优先保持 `docs/MVP-SPEC.md` 的原始业务语义，选择最小实现并记入 `docs/decisions.md`。保护用户现有修改。

### 二、明确目标

实现两个角色：`student` 和 `admin`。学生可以登录、浏览课程、参加至多一门进行中的课程、阅读 MDX 图文、运行独立 HTML/JS 互动模块、保存/恢复交互、完成测验、记章节笔记、获取积分。课程无时限、可退出恢复，完成后可再选课程。

管理员可以：创建/停用学生、管理课程元信息与发布状态、查看每个学生的当前课程与章节、课程进度、最近在线时间、最近交互时间、完成记录、积分，并在课程详情查看所有参加该课程的学生及其进度。

### 三、使用已选架构

- Next.js App Router + TypeScript（全栈单体，Route Handlers 提供 REST API）。
- Tailwind CSS + shadcn/ui（简洁界面、浅色/深色两种主题）。
- Supabase Auth + PostgreSQL + Storage；通过 `@supabase/ssr` 接入认证。
- Zod 入参校验、RLS、事务、唯一约束、幂等键。
- 仓库内可信 MDX + `course.json` 内容即代码；独立静态互动 App 使用跨域 iframe 和 Learning SDK。
- 管理页面轮询刷新；课程页面心跳。尽量减少额外运行时服务与依赖。
- 使用docker 或 docker compose 或者 mise来开发和部署

优先沿用仓库现有能通过测试的配置；锁定依赖版本并提交 lockfile。禁止临时改成独立后端框架、微服务或额外任务基础设施。

### 四、严格实施的核心逻辑

1. 每个学生最多一个 `active` enrollment，必须用 PostgreSQL 条件唯一索引保证，并写并发测试。重复报名同课幂等；退出再进恢复原进度；完成课程自动释放占用。
2. 独立记录 `last_seen_at`（心跳）和 `last_interaction_at`（真实交互）；超过 120 秒无有效心跳显示离线，但课程仍 active。
3. 章节按 `article / interactive / quiz` 三类播放；进度按必修章节完成数量计算。最终测验通过后才完成测验章节。
4. 互动课由开发者自由实现 HTML/JS/React/Vue/Canvas/3D；平台提供 `start`、`track`、`saveState`、`complete`、`submit`、`onRestore` SDK。
5. iframe postMessage 严格校验 origin/source/nonce/schema；不把身份令牌、正确答案或任何服务端密钥交给 iframe。
6. 事件与步骤自报告只用于遥测或 `reported` 类任务；`server_validated` 通过与积分由服务端判定；积分 `point_events` 去重。
7. 章节首次完成发 10 分，课程最终测验首次通过额外发 50 分，重复或并发请求不得重复发放。
8. 笔记仅所有者可读写；管理员默认无法读取。学生不可读取、修改其他学生的记录。
9. 课程内容从 Git 维护，提供 `courses:validate` 和 `courses:sync`；已有学习记录的课程不能原地改变必修结构。
10. 错误响应、状态码、字段名和 API 路径严格匹配 `docs/MVP-SPEC.md`。

### 五、执行要求

在同一轮开发流程中尽量推进可完成的阶段，按 `PLAN.md` 的依赖顺序实施。每一阶段：

- 实现页面、数据库迁移、RLS、Route Handlers、服务层和相应测试；禁止用 mock API 冒充已完成功能。
- 自检错误路径、权限边界、并发、幂等、重放和页面刷新恢复。
- 实际执行 lint、typecheck、test、build 和适用的 E2E；失败时修复再验证。
- 通过阶段门禁后勾选 `PLAN.md`；未运行或缺少凭据的任务保留未完成，并报告阻塞因素。
- 新增接口时同步 `docs/api.md`；复杂决策写入 `docs/decisions.md`。

优先生成两门可以从头到尾学习的示例课程，必须包含原理文章、互动实验、最终测验；至少实现一个具有事件上报、自动保存/恢复、服务端校验的真实可操作实验（最好两门各有一个）。

### 六、页面与体验

学生端 5 个路由：`/login`、`/courses`、`/courses/[slug]`、`/learn/[courseId]`、`/me`。

管理员端 4 个路由：`/admin`、`/admin/students`、`/admin/courses`、`/admin/courses/[id]`。

学生学习页使用统一播放器（章节导航 + 内容区 + 笔记抽屉）；管理员能从学生/课程两个维度查看详细学习情况。保持桌面易用、手机不横向溢出；显式提供浅色/深色切换。进度与状态信息以服务端真实数据呈现。

### 七、初始化和可复现性

- 创建 `.env.example`，区分浏览器公钥和仅服务端使用的密钥。
- 创建可以顺序执行的数据库迁移、RLS 策略与初始化管理员说明。
- 提供课程校验、同步、示例数据导入命令。
- `README.md` 包含本地启动、实验部署、测试和故障排查的**可复制命令**。
- 可选官方 Supabase 本地开发环境，以便在缺少云端密钥时仍能验证数据库与 RLS。
- 不承诺尚未实际执行的云端部署或 E2E 测试。

### 八、输出格式

每阶段汇报：

```text
[Phase N]
完成任务 ID：
功能实现与路径：
数据库迁移/API 变化：
测试命令及实际结果：
已知问题 / 阻塞：
PLAN.md 状态：
```

最终交付：

1. 可启动的 Next.js 应用与 Supabase 数据库迁移。
2. 规格中 28 个 API 方法的实现/覆盖情况。
3. Learning SDK、隔离互动实验和恢复机制。
4. 两门端到端示例课程、初始化账号方法。
5. 管理员进度监控与笔记、测验、积分闭环。
6. `README.md`、`.env.example`、`docs/architecture.md`、`docs/api.md`、`docs/course-authoring.md`、`docs/decisions.md`。
7. `PLAN.md` 中每项任务的真实状态以及 15 项验收结果。

**范围纪律**：不要开发社交、聊天室、排行榜、证书、AI 导师、任意 HTML 上传、靶机场景编排或可视化课程编辑器。重心是小而完整、可验证的 MVP。现在检查仓库并从 `PLAN.md` 的 Phase 0 开始执行。

---

## 使用方式

将文件按以下位置放入仓库：

```text
AGENTS.md
PROMPT.md
PLAN.md
docs/MVP-SPEC.md
```

在编码 Agent 中粘贴本文件「任务正文」作为首次任务。随后让 Agent 以 `PLAN.md` 作为持续进度记录；后续会话可要求它读取这四份文件继续执行。若某阶段已完成，先验证对应门禁，再继续下一个未完成阶段。
