# LearnOS — 互动式学习平台 MVP

LearnOS 是一个可运行的多人互动学习平台。管理员统一发放账号；学生通过**图文 MDX**、**概念动画**、**原生 React 互动组件**和**服务端判分测验**完成课程，并可记录私人笔记。系统保存学习进度、活跃时间与积分；管理员可从**学生**和**课程**两个维度查看学习记录。

- 业务规格：[`docs/MVP-SPEC.md`](docs/MVP-SPEC.md)（唯一业务真相源）
- 工程规范：[`AGENTS.md`](AGENTS.md)
- 实施计划与验收看板：[`PLAN.md`](PLAN.md)
- 架构与安全设计：[`docs/architecture.md`](docs/architecture.md)
- 28 个 MVP 业务 API + 部署/健康检查接口：[`docs/api.md`](docs/api.md)
- 课程制作与实验接入：[`docs/course-authoring.md`](docs/course-authoring.md)
- 混合章节制作指南（Manifest v3）：[`docs/mixed-chapters.md`](docs/mixed-chapters.md)
- 实现取舍日志：[`docs/decisions.md`](docs/decisions.md)
- 课程插件规范：[`docs/course-plugin-spec.md`](docs/course-plugin-spec.md)
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
| 数据 | Better Auth + Drizzle ORM + 独立 PostgreSQL；HttpOnly Session Cookie |
| 校验 | Zod（入参、课程 manifest、题库） |
| 内容 | 仓库内 `course.json` + MDX + 服务端题库/验证器，`courses:validate` / `courses:sync` |
| 互动 | 主应用内原生 React 活动组件 + 同源认证 Learning SDK |
| 测试 | Vitest（单元 + 真实 PostgreSQL/RLS 集成）、Playwright（E2E） |
| 本地基础设施 | Supabase CLI + Docker（Postgres/Auth/Studio/Mailpit） |

## 学习体验

- **概念动画**：每个核心知识点按「生活类比 → 动画 → 自由探索 → 知识检查 → 原理解释」组织，支持播放、暂停、重播、单步、速度、静态图解与 reduced-motion。
- **混合章节**：同一篇 MDX 可按教学需要组合文字、图片、SVG、动画、JS 模拟实验、立即反馈和不计分知识检查；章节可以完全没有互动，也可以有多个动画/实验/知识检查。
- **章节完成规则**：`manual` / `all` / `any`；正式实验与知识检查由服务端验证并记录，满足条件后自动完成章节，多个 Block 只发一次章节完成积分。
- **Block 独立状态**：多个动画与实验用 `blockId` 命名空间保存，自动保存、刷新恢复、多标签冲突和只读复习继续沿用原 Learning SDK。
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
pnpm db:start        # docker compose up -d postgres
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
pnpm db:status
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
pnpm db:migrate          # 应用 Drizzle 迁移；首次空库先执行 db/schema.sql
pnpm seed:admin          # 创建管理员 admin@learnos.local
pnpm seed:demo           # 创建 2 名学生，并同步/发布全部本地课程（含 HTTP 混合章节示范）
```

管理员与演示账号（**仅本地开发**）：

```text
管理员：admin@learnos.local      / LearnOS-Admin-2025!
学生 A：student1@learnos.local   / Student-One-2025!
学生 B：student2@learnos.local   / Student-Two-2025!
```

### 5. 启动应用

开发模式：

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

## 单机 Docker Compose 部署（生产）

正式部署只依赖一个 `docker-compose.yml`、一个 `Dockerfile` 和一个轻量 `updater` 容器。**不需要 GitHub API、GitHub Actions、Git Commit、Caddy/Nginx、镜像仓库、蓝绿部署或第二台服务器。**

```text
浏览器 ── http://10.66.66.2:3000 ──▶ web (Next.js standalone)
                                      │
                                      ├── Supabase（保持现有连接）
                                      │
          updater ── Supabase deployment_jobs（任务/日志）
             │
             └── Docker Socket：固定快照 → 校验 → compose build → sync → up → health
```

### 1. 准备环境

- Docker Engine + Compose v2（单机）。
- 现有 Supabase（本地 CLI 或托管均可），已执行迁移。
- 宿主机上的项目目录（updater 挂载它，并在自己的容器内创建 `/tmp/learnos-snapshots` 固定快照；任务与日志写入 Supabase）。
- 课程源码需对容器用户可读；如果宿主机 umask 较严，执行 `chmod -R a+rX content/courses`（Web 容器以非 root 用户读取只读挂载）。
- `.env.local` 至少包含：
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`（只服务端）
  - `DATABASE_URL`
  - `NEXT_PUBLIC_APP_URL`（例如 `http://10.66.66.2:3000`）
  - 可选 `LEARNOS_BIND_ADDRESS`（默认 `0.0.0.0`；只对外发布 3000）

### 2. 首次启动

```bash
docker compose --env-file .env.local up -d --build
```

- `web`：Next.js standalone 镜像，发布 `${LEARNOS_BIND_ADDRESS:-0.0.0.0}:3000`。它还把宿主机 `content/courses` 以只读方式挂到 `/workspace/content/courses`，仅用于管理员扫描；学生实际阅读的内容来自镜像，未部署的修改不会立即生效。
- `updater`：只轮询 Supabase、执行固定操作，不监听端口；挂载 Docker Socket。
- 容器内服务端 Supabase 使用 `http://host.docker.internal:54321`，浏览器仍使用 `NEXT_PUBLIC_SUPABASE_URL`。

首次启动后先访问 `/admin/courses` 管理发布状态；部署本身不会删除课程或学习记录。

### 3. 日常更新：复制目录 → 扫描 → 部署

```bash
cp -r content/courses/my-new-course content/courses/my-new-course-copy
# 编辑 copy/course.json 的 slug/version 与内容
```

1. 打开 `/admin/courses`，点击「扫描更新」。扫描只读取本地 `content/courses/`，不触发构建。
2. 确认「新课程 / 有更新 / 版本冲突 / 扫描失败」分类。版本号没变但源码变化会明确提示；已有学习记录的结构升级会阻止部署。
3. 打开 `/admin/deployments`，查看待部署课程、当前课程版本和上一成功版本。
4. 点击「编译并部署」。updater 依次执行：
   - 固定源码快照（构建期间修改课程文件不会影响本次镜像）；
   - `pnpm courses:prepare` / `pnpm courses:validate`；
   - `docker compose build web`；
   - 保存旧镜像可恢复引用；
   - `pnpm courses:preflight` 兼容性检查；
   - `pnpm courses:sync`；
   - `docker compose up -d --no-deps web`；
   - 健康检查（版本 + 镜像 + HTTP）；
   - 记录成功版本与课程快照。
5. 学生在原地址看到新课程/新内容；管理员在 `/admin/deployments` 看到准确的系统版本、课程版本、镜像摘要与日志。

### 4. 失败、回滚与数据安全

- **构建/校验失败**：不会替换正在运行的容器；`current` 镜像标签会恢复到旧镜像。
- **启动/健康检查失败**：自动把上一镜像恢复为 `learnos-web:current` 并重启 web；任务标记为「已自动回滚」。
- **手动回滚**：`/admin/deployments` → 「回滚到上一个版本」。updater 先检查目标版本的课程结构与当前数据库学习记录是否兼容；不兼容时拒绝，不会删除学生数据。
- **保留策略**：web 镜像只保留当前与上一个成功版本；任务、日志、课程快照保存在 Supabase `deployment_jobs` / `deployment_state`。
- **权限说明**：updater 拥有 Docker Socket 宿主级权限。这是单机管理员自用工具的明确取舍；它不接受任何用户提交的 Shell 命令，命令与参数都写死在 `deploy/updater/updater.mjs`。

### 5. 常用命令

```bash
docker compose --env-file .env.local ps
docker compose --env-file .env.local logs -f web updater
docker compose --env-file .env.local down          # 停止，不删除数据库
docker compose --env-file .env.local build web     # 手动构建（日常请用管理员页面）
```

> `.deployments/` 已加入 `.gitignore`。不要把 `.env.local`、服务端密钥或 Docker Socket 暴露到公网。生产环境仍建议在 3000 端口前加 TLS 反向代理，或只通过 VPN/内网访问。

## 课程内容工作流

课程是仓库中的可信代码，新增课程只需新增插件目录与 `course.json`，无需修改核心 Registry：

```bash
pnpm courses:prepare     # 扫描课程插件并生成 Registry（build/dev/typecheck 自动执行）
pnpm courses:scan        # 输出课程版本/源码摘要，供部署候选比较（不访问 Git）
pnpm courses:snapshot    # 输出完整固定快照（文件摘要、章节、Concept/Activity/Validator）
pnpm courses:validate    # 校验 manifest、MDX AST、Block/题库资源、最终测验、插件注册
pnpm courses:preflight   # 只读检查新结构是否与已有学习记录兼容
pnpm courses:sync        # 将元数据写入 courses/lessons，保留管理员发布状态
pnpm courses:sync --publish  # 显式发布（种子/演示用途）
```

- 手动运行 `pnpm courses:sync` 时新课程默认是 `draft`，在 `/admin/courses` 发布。
- 管理员「编译并部署」使用 `pnpm courses:sync --publish-new`：新课程自动发布，已有课程的发布状态保持不变，从而做到「复制 → 扫描 → 部署 → 学生可见」。
- 已有 enrollment 的课程**不能**修改必修章节集合、顺序或类型，以及 v3 必需 Block、完成模式、validator 指纹和必需题库哈希；结构性升级使用新 slug。
- 修改标题/简介/文案、可选动画和不影响完成条件的可选 Block 可原地同步。
- 新课程可使用 `schemaVersion: 3`，在 `article` 章节声明 `blocks` / `completion`；纯文字课程不需要任何插件。
- 复制一个新的 `content/courses/<slug>` 目录后，`pnpm courses:prepare` 会自动注册插件；不需要修改核心 Registry。
- Validator ID 在全局唯一；组件/验证器路径不允许通过符号链接逃出课程目录。

详见 [`docs/course-authoring.md`](docs/course-authoring.md) 与 [`docs/mixed-chapters.md`](docs/mixed-chapters.md)。

## 测试与验证

```bash
pnpm lint          # ESLint（Next core-web-vitals + TS）
pnpm typecheck     # tsc --noEmit
pnpm test          # Vitest：单元 + 真实 PostgreSQL/RLS/事务测试（需先 pnpm db:start）
pnpm test:unit     # 仅单元测试，无需数据库（CI 使用）
pnpm build         # 生产构建
pnpm security:scan # 扫描 .next/static：服务端密钥/测验解析不得进入客户端
pnpm test:e2e      # Playwright（需数据库已迁移/种子；自动复用或启动单个 Next.js 应用）
```

FloatCTF OIDC 相关：

```bash
pnpm oidc:check    # 配置 custom:floatctf 并执行上线前七项自检
pnpm test:e2e -g "FloatCTF"   # SSO 验收（需真实 IdP，见 docs/oidc-floatctf.md）
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

E2E 覆盖：管理员建号/停用、越权拒绝、CSRF、并发报名、同课幂等、退出恢复、120 秒离线语义、`bits-and-bytes`、`how-programs-run`、`data-structures`、`networking-basics`、`http-hands-on`、`command-line`、`git-basics`、`sql-basics`、`crypto-basics` 等课程的完整闭环（图文/动画/模拟/知识检查/结业测验/刷新恢复，全部实验经服务端验证，结课并核对积分）、学习路线的导航入口、路线图与推荐、管理端课程卡点分析（聚合数字与错误选项记录）、新课程部署控制台扫描与权限隔离、原生互动刷新恢复、多标签状态冲突、服务端验证实验、测验答案保密、积分去重、笔记隔离、归档课程禁止新报名、生产页面无 iframe、确认操作使用模态对话框。测试用户由 `tests/e2e/helpers.ts` 动态创建并清理。

## 目录结构

```text
app/
  (student)/            # /courses、/courses/[slug]、/me
  (learning)/           # /learn/[courseId]（1600px 学习画布）
  (admin)/admin/        # /admin、/admin/students、/admin/students/[id]、/admin/courses、/admin/courses/[id]、/admin/deployments
  api/                  # 业务 REST 方法 + /api/health + /api/admin/deployments/**
  login/
components/             # 工作区、概念动画、原生互动组件、笔记、管理端、部署控制台与 UI
lib/
  api/                  # 统一响应、错误码、Origin/CSRF、鉴权守卫
  auth/                 # 服务端会话、角色守卫、登录 Server Action
  content/              # Manifest v3 统一章节、MDX AST 校验、Block/完成规则、内容加载、验证器注册表
  deployments/          # 课程快照、扫描比较、部署类型
  learning/             # 同源 Learning SDK、Chapter/Block State、状态保存 Hook
  activities/           # 互动模拟纯函数与 activityId 目录
  services/             # 报名/进度/互动/测验/笔记/积分/报表/部署
  lib/db/               # Drizzle 客户端与 Better Auth schema
content/courses/        # 课程插件：course.json、MDX、题库、服务端验证器；含 bits-and-bytes、how-programs-run、data-structures、networking-basics、http-hands-on、command-line、git-basics、sql-basics、crypto-basics 等课程
db/                     # 独立 PostgreSQL schema、Drizzle 迁移
tests/                  # unit、integration（RLS/事务）、e2e（Playwright）
scripts/                # 课程同步/校验/快照、种子、性能脚本、安全扫描
deploy/updater/         # 最小更新执行器（Docker CLI + Node）
docker-compose.yml      # web + updater
Dockerfile              # web 的 deps/tools/builder/runner 多阶段镜像
docs/                   # 规格、架构、API、课程制作、混合章节、决策、截图
```

## 关键实现点

- **单课程占用**：`one_active_enrollment_per_student` 部分唯一索引 + `join_course` 事务函数；并发时只有一个请求成功，其余 `409 ACTIVE_COURSE_EXISTS`。
- **完成与积分原子化**：章节完成、课程结课、`point_events` 写入在同一数据库事务；`dedupe_key` 唯一，重复/并发/重放不重复发分。
- **服务端权威**：测验/知识检查答案只在服务端文件；模拟实验与章节知识检查由服务端重新判定；浏览器角色无权写 `block_results`、进度、积分或成绩。
- **Block 状态隔离**：`{ schemaVersion: 2, blocks: { [blockId]: ... } }` 统一合并保存；`block_attempts` / `block_results` 记录幂等尝试与可信通过。
- **在线与交互分离**：`last_seen_at` 由约 60 秒心跳更新；`last_interaction_at` 由章节切换、事件、提交、笔记等实际操作更新；120 秒无心跳仅显示离线，不改变 enrollment。
- **原生互动组件**：`activityId` 通过显式 Registry 映射到可信 React 组件；组件与主应用同源，但只通过受认证的同源 API 读写状态；服务端验证器独立判定结果。
- **笔记私有**：`notes` RLS 仅允许本人；管理员无策略与 API，无法读取。
- **无自由注册**：管理员创建学生；禁用账号后每个业务请求都会重新校验 `disabled_at`。
- **加载与交互**：课程详情预取学习页、章节链接预取、顶部导航进度条、章节 pending 指示、笔记/实验/测验服务端直出、完成按钮乐观更新。详见 [`docs/performance.md`](docs/performance.md)。

## 部署要点

1. 启动独立 PostgreSQL，执行 `db/schema.sql` 与 `pnpm db:migrate`，再运行 `pnpm seed:admin`。
2. 单机生产使用 `docker compose --env-file .env.local up -d --build`；日常课程更新走管理员 `/admin/deployments`。
3. 用 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 运行 `pnpm seed:admin`（或等价受控脚本）创建管理员；生产环境立即改密。
4. 配置 SMTP 以启用密码重置邮件（本地用 Mailpit 查看）。
5. 如使用反向代理，保留 Cookie 安全属性；本 Compose 只发布 3000 端口，updater 不监听端口。
6. 不需要 Git Commit、GitHub Actions、镜像仓库或蓝绿部署；部署版本由 `YYYY.MM.DD-NN` 与镜像摘要记录。

> 本仓库的验证在**本地 Supabase + 单机 Docker Compose** 上完成；未执行云端托管、真实 SMTP 或第二台服务器重放。

## 故障排查

- **`pnpm db:start` 端口冲突**：修改 `docker-compose.yml` 的 Postgres 端口或 `LEARNOS_DB_URL`。
- **登录 401 / 无 Cookie**：确认 `NEXT_PUBLIC_SUPABASE_URL` 与浏览器访问的主机一致；清空站点 Cookie 后重试。
- **课程不显示**：确认已执行 `pnpm courses:sync` 且在 `/admin/courses` 发布；学生只看到 `published`。
- **互动组件未显示**：确认课程已执行 `pnpm courses:sync`，且 `activityId` 已在 `components/activities/registry.tsx` 注册；`pnpm courses:validate` 会拒绝未注册的 activityId。
- **局域网访问时保存按钮报错**：HTTP 局域网地址不是安全上下文，`crypto.randomUUID` 可能不可用；项目内置退化 UUID 实现，若仍报错请确认使用最新代码并重启。
- **E2E 浏览器启动失败（缺少 libnspr4 / 字体）**：优先 `pnpm exec playwright install --with-deps chromium`（需 root）。无 root 环境可把所需 `.deb` 解包到仓库内 `.pwlibs/`（已 gitignore），并放置 `fonts.conf`；`playwright.config.ts` 会自动注入 `LD_LIBRARY_PATH` / `FONTCONFIG_FILE`。
- **开发服务器卡在 Starting**：本项目使用 `next dev --turbopack`（在 Node 26 + webpack dev 下曾出现挂起）。不要在 `pnpm dev` 运行时执行 `pnpm build`，否则需删除 `.next` 后重启。
- **`pnpm test` 报无法连接数据库**：先 `pnpm db:start`，确认 `DATABASE_URL` 指向 54322。
- **Docker 部署后登录失败**：确认 `SUPABASE_INTERNAL_URL` 在容器内可访问（默认 `http://host.docker.internal:54321`），且 Linux 上的 Compose 已配置 `extra_hosts: host.docker.internal:host-gateway`。
- **updater 一直不领取任务**：`docker compose logs -f updater`；确认 Docker Socket 已挂载、`deployment_jobs` 迁移已应用、`SUPABASE_SERVICE_ROLE_KEY` 在容器内可用。
- **健康检查失败并自动回滚**：查看 `/admin/deployments` 构建日志与 `docker compose logs web`；检查 `/api/health` 返回的 `LEARNOS_BUILD_VERSION` 是否为新版本。
- **回滚被拒绝**：说明目标版本的课程结构与当前数据库学习记录不兼容。不要删除数据强行回滚；使用新 slug 发布结构升级。
- **端口 3000 被占用**：先停止旧的 `pnpm start`/`next start` 进程，再 `docker compose up -d`。
- **构建日志出现 `Docker Compose requires buildx plugin`**：updater 镜像未安装 buildx 时 Compose 会回退到经典构建器，构建、容器替换与回滚仍然正常；该警告不影响结果。
- **课程同步报“拒绝改变必修结构”**：该课程已有学习记录。改文案可直接同步；结构性调整请使用新 slug。

## 已知限制（MVP 范围）

- 不开放自由注册、社交/聊天/排行榜/证书/AI 导师/可视化课程编辑器。
- 不提供学生自助改密页面；管理员可触发 Supabase 密码重置邮件。
- 不使用 Supabase Storage（MVP 无图片上传需求），不执行用户上传的任意 HTML/JS。
- 示例课程的题库和验证器随公开仓库发布，仅适用于演示；正式测评需使用私有题库/验证器或私有内容卷部署。
- 管理端通过 30 秒轮询更新，不使用 WebSocket。
- 云端部署、真实 SMTP、跨域生产域名未在本环境验证；相关配置步骤已记录。
