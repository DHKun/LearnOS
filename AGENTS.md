# AGENTS.md — LearnOS 开发 Agent 工作规范

> 适用范围：本仓库全局。面向 Codex、Claude Code、OpenCode、Cursor 等编码 Agent。本文约束开发流程、工程质量和交付方式。
>
> 业务真相源：`docs/MVP-SPEC.md`（由 `LearnOS-MVP-SPEC.md` 放入此路径）。先读规格，再修改代码。

## 1. 项目目标

交付一个可实际使用的多人互动学习平台 MVP：管理员发放账号；学生同时只能学习一门进行中的课程，课程无时间限制；学生通过图文、原生 JS/React 交互组件和服务端测验学习，可随时记笔记；系统保存学习进度、最新活跃时间和积分；管理员按学生或课程查看学习记录。

**实现优先级**：端到端可用性 > 数据/权限正确性 > 稳定性 > 页面美观 > 扩展性。任何“开发完成”都必须有对应的可执行证据。

## 2. 文件职责与优先级

1. `docs/MVP-SPEC.md`：**最高优先级**；冻结的 MVP 需求、11 张业务表、28 个 API 方法、SDK 契约、状态机、15 项验收。
2. `AGENTS.md`（本文件）：编码行为、项目约定、测试和汇报约束。
3. `PLAN.md`：任务依赖、阶段门禁、进度勾选与交付状态。
4. `PROMPT.md`：给执行 Agent 的启动指令；不能扩展或覆盖业务规格。
5. `docs/decisions.md`：记录规格未覆盖的实现细节及取舍；发生冲突时回到规格修正。

若仓库中原已有代码，先盘点与上述规格的差异，保留符合需求的实现，增量修改；空仓再初始化。

## 3. 固定技术栈与边界

- 应用：**Next.js App Router + TypeScript**，前后端在同一个 Next.js 项目，业务 API 用 Route Handlers。
- UI：**Tailwind CSS + shadcn/ui**，桌面优先、窄屏可用，支持 light/dark。ASCII 可做主题扩展，但不作为上线阻塞项。
- 数据：**Supabase Auth + PostgreSQL + Supabase Storage**；通过 `@supabase/ssr` 管理 Cookie 会话。
- 输入校验：**Zod**；数据操作需行级授权；关键写操作使用数据库事务、唯一约束和幂等键。
- 课程：每门课程是 `content/courses/<slug>/` 插件；Manifest v2 保持兼容，v3 增加章节内 `blocks` / `completion`。`pnpm courses:prepare` 自动生成 Registry，禁止手工维护注册表。
- 章节模型：Course → Chapter（`lessons`）→ Block。MDX 负责文字/图片/动画/实验/题目的顺序与排版；Manifest 只声明需要验证的 simulation/question Block 及完成规则。纯文字、纯动画、纯实验、纯题目章节均合法。
- 互动：主应用内原生 React 组件 + 同源认证 Learning SDK；后端核准完成状态及积分。不得使用 iframe、postMessage 或独立 Labs 站点。
- 教学：抽象概念优先使用「生活类比 → 动画解释 → 自由探索 → 即时反馈 → 知识检查 → 原理总结」。动画必须有暂停/重播/单步/静态替代，并支持 reduced-motion；动画播放本身不产生积分。
- 本地包管理：优先 **pnpm**，提交 lockfile；测试框架使用与 Next.js 兼容的轻量组合，可选 Vitest + Playwright。
- 监控：管理端 **30 秒轮询**；学生页面可见且活动时约 **60 秒心跳**；在线判定窗口 **120 秒**。

**禁止擅自引入**：微服务、Redis、消息队列、Kubernetes、WebSocket、AI 导师、实时聊天、课程 WYSIWYG 编辑器、自由上传并执行任意 HTML/JS、容器靶场、复杂角色体系。用户另行明确批准才改变范围。

## 4. Agent 启动必做

在首次写代码前：

1. 读 `docs/MVP-SPEC.md`、`AGENTS.md`、`PLAN.md`、`PROMPT.md`、`package.json` 和现有目录（存在时）。
2. 检查现有依赖、迁移、Supabase 配置、测试、Git 工作区；识别已有功能及未提交修改，不覆盖无关工作。
3. 依据 `PLAN.md` 确定当前最早未通过门禁的 Phase，说明本轮完成的任务编号。
4. 对外部 API/库的版本差异查看已安装类型、官方文档或源码；不要假设过时接口仍适用。锁定依赖版本并复现构建。
5. 执行改动；每完成可测试功能立即补充对应测试；门禁通过后更新 `PLAN.md` 状态。

可以使用可用的技能、脚本及子 Agent，但应基于任务需要选择；不要为了展示调用而调用。缺少外部凭据时完成可离线部分及配置说明，准确列出阻塞项，不伪造部署或测试结果。

## 5. 代码组织原则

推荐目录（可以根据 Next.js 约定微调，但保持职责清晰）：

```text
app/
  (auth)/login/
  (student)/courses/  (learning)/learn/  (student)/me/
  (admin)/admin/
  api/
components/
lib/
  auth/                 # 服务端身份与角色检查
  db/                   # Supabase 客户端与查询
  schemas/              # Zod schema / API 类型
  services/             # enrollments/progress/quiz/points/reporting
  learning/             # 同源 SDK、React Context、状态保存 Hook
  education/            # 概念元数据、事件语义映射
components/education/   # 动画控制器、生活类比框、知识检查
components/concepts/    # conceptId registry 与概念动画
components/activities/  # activityId registry 与原生互动组件
content/courses/        # 课程 manifest、MDX、服务端题目/校验器
supabase/migrations/    # 可追踪数据库迁移
scripts/                # 初始化管理员、课程校验与同步
tests/                  # 单元/集成/RLS/E2E
docs/                   # 规格、架构、API、课程制作、决策
```

- Route Handler：解析请求、验证身份和输入、调用 service、返回统一 JSON；业务规则留在服务层。
- 客户端组件只处理展示和交互；权限、答案、积分、课程完成、学生归属由服务端决定。
- 接口使用统一结构：成功 `{ "data": ... }`；失败 `{ "error": { "code": "...", "message": "..." } }`。
- 数据库时间一律 UTC；前端根据浏览器本地时区显示。命名、状态值、HTTP 方法与响应字段遵守规格。
- 不提前创建规格外的 API/表/角色。

## 6. 必须遵守的业务不变量

### 6.1 课程占用与恢复

- PostgreSQL 条件唯一索引 `one_active_enrollment_per_student`：**每名学生最多一条 `status = 'active'` 的 enrollment**。
- `UNIQUE(student_id, course_id)` 保证同一课程重进时复用历史记录；`abandoned → active` 恢复进度，`completed` 可只读复习。
- 并发报名必须靠数据库原子约束保证；有其他 active 课程则返回 `409 ACTIVE_COURSE_EXISTS`。
- 课程没有倒计时/过期逻辑；心跳离线不改变 enrollment.status。
- 完成全部必修 Lesson（含最终已通过的测验）后，在事务中结课并释放课程占用。

### 6.2 学习事件、状态和积分

- 心跳 `last_seen_at` 与有效交互 `last_interaction_at` 分开；后台区分「课程进行中」和「最近在线」。
- `activity_events.id` 去重；`activity_states` 用 `expectedVersion` 乐观锁，冲突 `409 STATE_VERSION_CONFLICT`。
- 混合章节的 Block 状态使用 `{ schemaVersion: 2, blocks: { [blockId]: ... } }` 命名空间，多个 Concept/Simulation/KnowledgeCheck 不得互相覆盖；统一通过 `useBlockState` / block-scoped Learning SDK 保存。
- 正式 Block 结果写入 `block_attempts` / `block_results`；只有服务端 validator 或题库评分能产生 `passed`。`save_block_result` 负责幂等、章节完成判定与首次 +10 积分事务。
- SDK `complete` 的自报告只能满足允许的 `reported` 策略；`server_validated` 章节必须使用服务端校验器。
- Quiz 正确答案及评分器保留在服务端；不传给浏览器或互动组件。
- 每 Lesson 首次完成 **+10**，课程最终测验首次通过额外 **+50**；重复完成、重放、并发、刷新都不重复发分。
- `point_events.dedupe_key` 唯一；章节完成/结课/积分写入在同一事务完成。积分合计以 ledger 为准。
- 默认不向管理员展示学生的私人笔记。

### 6.3 课程版本管理

- 课程内容通过 `content/courses/**/course.json` 和 `pnpm courses:validate`、`pnpm courses:sync` 发布。
- 课程已经有 enrollment 后，必修集合、章节 ID/顺序、评分规则以及 v3 的必需 Block/完成模式/validator 指纹/必需题库哈希冻结；结构性升级使用新的 course slug；允许修正文案、可选动画和不影响完成条件的可选 Block。
- 发布前必须至少有 1 个必修 Lesson，并验证最终测验、validator 资源及结构完整性。

## 7. 认证、安全与隔离

- 服务端使用已验证的 Supabase 身份确定用户 ID；无视客户端传入的 `studentId`/`role` 自述值。
- 所有对外可访问的业务表开启 RLS；逐资源校验 owner/course/enrollment/lesson 归属；管理端接口强制 `admin` 角色。
- **Secret Key / service-role 权限只可在服务端**；禁止进入 `NEXT_PUBLIC_*`、客户端 bundle、Git、日志和 API 响应。
- 管理员创建学生时只可创建 student；禁用账号必须使业务接口立即拒绝；重置密码通过受控流程。
- 使用 cookie 认证的写接口做 Origin/CSRF 保护；Zod 校验长度、类型、数据结构和枚举；限制遥测频率及 payload、笔记 64KB。
- 动态笔记只按安全 Markdown 渲染；仓库内可信 MDX 可编译，外部用户提供的 MDX 不可直接执行。
- 互动组件只允许来自仓库内经过审核的 Registry；禁止根据用户输入构造模块路径。
- 组件与主应用同源，只允许通过受认证的 `/api/learning/**` 读写状态；不得直接持有 service role 或绕过服务端校验。
- 互动组件不得使用 `eval` 或执行用户输入的任意脚本；纯客户端仿真只作为教学交互，最终通过/积分必须由服务端验证器判定。
- 遥测是客户端声明；**不能把任意客户端事件当作可信过关凭证**。
- 概念动画与 MiniCheck 不得替代服务端正式测验；MiniCheck 不计分，不改变章节完成状态。混合章节的 KnowledgeCheck 由服务端题库评分，答案/解析不得进入浏览器。
- 客户端不得直接写 `block_results`；Block 提交必须经 `/api/learning/blocks/submit`，服务端重新计算后再调用事务函数。

## 8. 测试与阶段门禁

最小验证命令（若仓库脚本名不同，统一映射到这些 npm scripts）：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

每个 Phase 至少包括：

- 新增/变更业务逻辑的单元或集成测试。
- 增加/调整 RLS 或迁移时，对真实 PostgreSQL/Supabase 环境执行数据库/RLS 测试；仅 mock 通过不能视为权限测试通过。
- 并发课程报名、同键重复提交、状态版本冲突、跨用户资源访问等关键路径有自动化覆盖。
- 核心 E2E：管理员建号 → 学生登录 → 报名 → 图文 → 互动 → 测验 → 结课 → 积分 → 管理员查询。

**门禁规则**：`PLAN.md` 对应 Phase 测试成功且关键流程可复现，才将 Phase 标记为完成。未运行/受环境阻塞必须写「未验证」并说明原因。

## 9. 交付物与开发日志

每阶段更新：

- `PLAN.md`：复选框和门禁状态；不要提前打勾。
- `docs/decisions.md`：规格之外的重要选择（日期、背景、决定、理由、影响）。
- 有 API/数据行为变化时同步 `docs/api.md`、`docs/architecture.md`、`docs/course-authoring.md`。
- `.env.example` 仅保留变量名和安全示例值，绝不提交真实凭据。
- `README.md` 应有从零启动、迁移、初始化管理员、导入课程、启动实验、运行测试的实际命令。

每次阶段汇报采用统一模板：

```text
Phase / 任务：
完成项：
修改文件：
迁移与 API：
测试：命令 + 实际结果（通过/失败/未运行）
遗留问题与风险：
下一步：
```

任务完成时列出可运行入口、演示账号创建方法、两门种子课程、全套测试结果及明确的未实现项。不得以页面截图、静态 mock 或「代码已写」代替业务与安全验收。
