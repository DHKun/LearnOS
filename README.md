# LearnOS — 互动式学习平台 MVP

LearnOS 是一个可运行的多人互动学习平台。管理员统一发放账号；学生通过**图文 MDX**、**概念动画**、**原生 React 互动组件**和**服务端判分测验**完成课程，并可记录私人笔记。系统保存学习进度、活跃时间与积分；管理员可从**学生**和**课程**两个维度查看学习记录。

- 业务规格：[`docs/MVP-SPEC.md`](docs/MVP-SPEC.md)（唯一业务真相源）
- 工程规范：[`AGENTS.md`](AGENTS.md)
- 实施计划与验收看板：[`PLAN.md`](PLAN.md)
- 架构与安全设计：[`docs/architecture.md`](docs/architecture.md)
- 28 个 API 契约：[`docs/api.md`](docs/api.md)
- 课程制作与实验接入：[`docs/course-authoring.md`](docs/course-authoring.md)
- 实现取舍日志：[`docs/decisions.md`](docs/decisions.md)
- 30+ 次性能优化与测量：[`docs/performance.md`](docs/performance.md)
- 静态审计修复记录：[`docs/audit-remediation.md`](docs/audit-remediation.md)
- 概念动画与教学设计：[`docs/teaching-design.md`](docs/teaching-design.md)
- UX/教学升级报告：[`docs/ux-upgrade.md`](docs/ux-upgrade.md)

![登录页](docs/screenshots/login.png)
![课程目录](docs/screenshots/courses.png)
![学习工作区](docs/screenshots/workspace-desktop-top.png)
![移动端学习](docs/screenshots/workspace-mobile-top.png)
![学习播放器](docs/screenshots/learn-article.png)
![概念动画](docs/screenshots/concept-sql-data.png)
![原生互动实验](docs/screenshots/native-sql-activity.png)
![管理概览](docs/screenshots/admin-overview-v2.png)
![学生详情](docs/screenshots/admin-student-detail-v2.png)
![深色主题](docs/screenshots/dark-course-detail.png)

## 技术栈

| 层 | 选择 |
| --- | --- |
| 应用 | Next.js 15 App Router + TypeScript，Route Handlers 提供 REST API |
| UI | Tailwind CSS 4 + shadcn/ui 风格组件（Radix 原语），light/dark |
| 数据 | Supabase Auth + PostgreSQL + RLS；`@supabase/ssr` Cookie 会话 |
| 校验 | Zod（入参、课程 manifest、题库） |
| 内容 | 仓库内 `course.json` + MDX + 服务端题库/验证器，`courses:validate` / `courses:sync` |
| 互动 | 主应用内原生 React 活动组件 + 同源认证 Learning SDK |
| 测试 | Vitest（单元 + 真实 PostgreSQL/RLS 集成）、Playwright（E2E） |
| 本地基础设施 | Supabase CLI + Docker（Postgres/Auth/Studio/Mailpit） |

## 学习体验

- **概念动画**：每个核心知识点按「生活类比 → 动画 → 自由探索 → 知识检查 → 原理解释」组织，支持播放、暂停、重播、单步、速度、静态图解与 reduced-motion。
- **混合内容**：MDX 文章可组合文字、动画、Callout 和不计分知识检查；旧文章无需改写。
- **学习工作区**：可折叠目录、专注模式、默认关闭的笔记抽屉、移动端目录/笔记抽屉、上一节/下一节与完成条件提示。
- **管理员监控**：独立学生详情（概览/章节/时间线/积分）、待关注学生视图、课程学员分页与双向跳转。
- **数据可靠性**：管理端可见性感知轮询、笔记本地草稿与冲突提示、元数据同步保护、状态乐观锁。

## 从零启动（本地）

### 0. 前置条件

- Node.js ≥ 20.11（推荐 22 LTS）
- pnpm 12（仓库声明 `packageManager: pnpm@12.14.0`）
- Docker + Docker Compose（用于本地 Supabase）

### 1. 安装依赖

```bash
pnpm install
```

### 2. 启动本地 Supabase

```bash
pnpm db:start        # npx supabase start
```

首次会拉取镜像。默认端口：

| 服务 | 地址 |
| --- | --- |
| API | http://127.0.0.1:54321 |
| PostgreSQL | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| Mailpit（本地收件箱） | http://127.0.0.1:54324 |

### 3. 配置环境变量

```bash
cp .env.example .env.local
npx supabase status -o env
```

把输出填入 `.env.local`：

| `.env.local` 变量 | 来源 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `API_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY`（**仅服务端**） |
| `DATABASE_URL` | `DB_URL`（集成/RLS 测试使用） |
| `NEXT_PUBLIC_APP_URL` | 浏览器访问主站的地址，如 `http://10.66.66.2:3000` |
| `APP_BIND_HOST` / `APP_PORT` | Next.js 绑定地址/端口，默认 `0.0.0.0:3000` |

> `SUPABASE_SERVICE_ROLE_KEY` 绝不能进入 `NEXT_PUBLIC_*`、客户端组件、Git 或日志。`pnpm security:scan` 会扫描构建后的客户端资源。

### 4. 建库并导入种子数据

```bash
pnpm db:reset            # 应用 supabase/migrations 全部迁移
pnpm seed:admin          # 创建管理员 admin@learnos.local
pnpm seed:demo           # 创建 2 名学生，并同步/发布两门示例课程
```

管理员与演示账号（**仅本地开发**）：

```text
管理员：admin@learnos.local      / LearnOS-Admin-2025!
学生 A：student1@learnos.local   / Student-One-2025!
学生 B：student2@learnos.local   / Student-Two-2025!
```

### 5. 启动应用

```bash
pnpm dev
```

绑定地址由 `APP_BIND_HOST` / `APP_PORT` 控制（默认 `0.0.0.0:3000`）。本仓库 `.env.local` 当前配置为 `10.66.66.2`，访问 **http://10.66.66.2:3000**。

> 日常体验/演示建议使用生产模式：
>
> ```bash
> pnpm preview   # next build && next start（地址取自 APP_BIND_HOST）
> ```
>
> 修改代码后再用 `pnpm dev` 开发，或重新 `pnpm preview`。

所有互动实验都是主应用内的原生 React 组件，经 `components/activities/registry.tsx` 显式注册；不再需要独立 Labs 站点、静态服务器、iframe 或 postMessage。

### 指定绑定地址 / 局域网访问

```bash
# .env.local
APP_BIND_HOST="10.66.66.2"
APP_PORT="3000"
NEXT_PUBLIC_APP_URL="http://10.66.66.2:3000"
```

如果主机配置了 HTTP 代理，请把该 IP 加入 `NO_PROXY/no_proxy`，否则浏览器或测试工具可能经代理访问。

## 课程内容工作流

课程是仓库中的可信代码，不在管理后台编辑章节：

```bash
pnpm courses:validate    # 校验 manifest、MDX/题库资源、最终测验、validator 注册
pnpm courses:sync        # 将元数据写入 courses/lessons，保留管理员发布状态
pnpm courses:sync --publish  # 显式发布（种子/演示用途）
```

- 新课程同步后默认是 `draft`，在 `/admin/courses` 发布。
- 已有 enrollment 的课程**不能**修改必修章节集合、顺序或类型；结构性升级使用新 slug。
- 修改标题/简介/文案/题库（不改变结构）可原地同步。

详见 [`docs/course-authoring.md`](docs/course-authoring.md)。

## 测试与验证

```bash
pnpm lint          # ESLint（Next core-web-vitals + TS）
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest：单元 + 真实 PostgreSQL/RLS/事务测试（需先 pnpm db:start）
pnpm build         # 生产构建
pnpm security:scan # 扫描 .next/static：服务端密钥/测验解析不得进入客户端
pnpm test:e2e      # Playwright（需数据库已迁移/种子；自动复用或启动单个 Next.js 应用）
```

一键运行：

```bash
pnpm verify        # lint + typecheck + test + build + security scan
```

首次运行 Playwright 需要浏览器：

```bash
pnpm exec playwright install chromium
# 无 root 的 Linux 沙箱可参考“故障排查”
```

E2E 覆盖：管理员建号/停用、越权拒绝、CSRF、并发报名、同课幂等、退出恢复、120 秒离线语义、两门课程完整闭环、原生互动刷新恢复、多标签状态冲突、服务端验证实验、测验答案保密、积分去重、笔记隔离、归档课程禁止新报名、生产页面无 iframe、确认操作使用模态对话框。测试用户由 `tests/e2e/helpers.ts` 动态创建并清理。

## 目录结构

```text
app/
  (student)/            # /courses、/courses/[slug]、/learn/[courseId]、/me
  (admin)/admin/        # /admin、/admin/students、/admin/students/[id]、/admin/courses、/admin/courses/[id]
  api/                  # 28 个 REST 方法
  login/
components/             # 工作区、概念动画、原生互动组件、笔记、管理端与 UI
lib/
  api/                  # 统一响应、错误码、Origin/CSRF、鉴权守卫
  auth/                 # 服务端会话、角色守卫、登录 Server Action
  content/              # manifest schema、内容加载、验证器注册表
  learning/             # 同源 Learning SDK、React Context、状态保存 Hook
  activities/           # 互动模拟纯函数与 activityId 目录
  services/             # 报名/进度/互动/测验/笔记/积分/报表
  supabase/             # browser/server/admin 客户端与中间件
content/courses/        # 两门课程：course.json、MDX、题库、服务端验证器
supabase/migrations/    # schema、RLS、事务函数
tests/                  # unit、integration（RLS/事务）、e2e（Playwright）
scripts/                # 课程同步/校验、种子、性能脚本、安全扫描
docs/                   # 规格、架构、API、课程制作、决策、截图
```

## 关键实现点

- **单课程占用**：`one_active_enrollment_per_student` 部分唯一索引 + `join_course` 事务函数；并发时只有一个请求成功，其余 `409 ACTIVE_COURSE_EXISTS`。
- **完成与积分原子化**：章节完成、课程结课、`point_events` 写入在同一数据库事务；`dedupe_key` 唯一，重复/并发/重放不重复发分。
- **服务端权威**：测验答案只在服务端文件；互动 `server_validated` 由注册的验证器判定；浏览器角色无权写进度、积分或成绩。
- **在线与交互分离**：`last_seen_at` 由约 60 秒心跳更新；`last_interaction_at` 由章节切换、事件、提交、笔记等实际操作更新；120 秒无心跳仅显示离线，不改变 enrollment。
- **原生互动组件**：`activityId` 通过显式 Registry 映射到可信 React 组件；组件与主应用同源，但只通过受认证的同源 API 读写状态；服务端验证器独立判定结果。
- **笔记私有**：`notes` RLS 仅允许本人；管理员无策略与 API，无法读取。
- **无自由注册**：管理员创建学生；禁用账号后每个业务请求都会重新校验 `disabled_at`。
- **加载与交互**：课程详情预取学习页、章节链接预取、顶部导航进度条、章节 pending 指示、笔记/实验/测验服务端直出、完成按钮乐观更新。详见 [`docs/performance.md`](docs/performance.md)。

## 部署要点

1. 使用托管 Supabase 或自建 Postgres/Auth，执行 `supabase db push` / 迁移。
2. 配置服务端环境变量（`SUPABASE_SERVICE_ROLE_KEY` 仅服务端），构建 `pnpm build`，用 `pnpm start` 运行。
3. 用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 运行 `pnpm seed:admin`（或等价受控脚本）创建管理员；生产环境立即改密。
4. 配置 SMTP 以启用密码重置邮件（本地用 Mailpit 查看）。
5. 反向代理需保留 Cookie 安全属性；只需一个 Next.js 域名。

> 本仓库的验证均在**本地 Supabase + Docker** 上完成；未执行云端托管部署，也未配置真实 SMTP。

## 故障排查

- **`pnpm db:start` 端口冲突**：修改 `supabase/config.toml` 的 API/DB/Studio/Inbucket 端口，并同步 `.env.local`。
- **登录 401 / 无 Cookie**：确认 `NEXT_PUBLIC_SUPABASE_URL` 与浏览器访问的主机一致；清空站点 Cookie 后重试。
- **课程不显示**：确认已执行 `pnpm courses:sync` 且在 `/admin/courses` 发布；学生只看到 `published`。
- **互动组件未显示**：确认课程已执行 `pnpm courses:sync`，且 `activityId` 已在 `components/activities/registry.tsx` 注册；`pnpm courses:validate` 会拒绝未注册的 activityId。
- **局域网访问时保存按钮报错**：HTTP 局域网地址不是安全上下文，`crypto.randomUUID` 可能不可用；项目内置退化 UUID 实现，若仍报错请确认使用最新代码并重启。
- **E2E 浏览器启动失败（缺少 libnspr4 / 字体）**：优先 `pnpm exec playwright install --with-deps chromium`（需 root）。无 root 环境可把所需 `.deb` 解包到仓库内 `.pwlibs/`（已 gitignore），并放置 `fonts.conf`；`playwright.config.ts` 会自动注入 `LD_LIBRARY_PATH` / `FONTCONFIG_FILE`。
- **开发服务器卡在 Starting**：本项目使用 `next dev --turbopack`（在 Node 26 + webpack dev 下曾出现挂起）。不要在 `pnpm dev` 运行时执行 `pnpm build`，否则需删除 `.next` 后重启。
- **`pnpm test` 报无法连接数据库**：先 `pnpm db:start`，确认 `DATABASE_URL` 指向 54322。
- **课程同步报“拒绝改变必修结构”**：该课程已有学习记录。改文案可直接同步；结构性调整请使用新 slug。

## 已知限制（MVP 范围）

- 不开放自由注册、社交/聊天/排行榜/证书/AI 导师/可视化课程编辑器。
- 不提供学生自助改密页面；管理员可触发 Supabase 密码重置邮件。
- 不使用 Supabase Storage（MVP 无图片上传需求），不执行用户上传的任意 HTML/JS。
- 示例课程的题库和验证器随公开仓库发布，仅适用于演示；正式测评需使用私有题库/验证器或私有内容卷部署。
- 管理端通过 30 秒轮询更新，不使用 WebSocket。
- 云端部署、真实 SMTP、跨域生产域名未在本环境验证；相关配置步骤已记录。
