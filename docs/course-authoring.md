# 课程制作与互动组件接入

LearnOS 采用**内容即代码**：课程结构、MDX、题库与服务端验证器都在仓库中，经脚本校验后同步到数据库。管理员 UI 只管理发布状态与标题/简介，不编辑章节内容。

> **唯一正式模型（Manifest v3）**：`Course → Chapter → 可选 Block → 完成规则`。每个章节都有 MDX 正文；模拟实验与正式知识检查是可选的 Block。没有独立的「实验页」或「测验页」类型，也没有 v2 兼容分支。

## 1. 目录结构

```text
content/courses/<course-slug>/
  course.json              # 课程 manifest（schemaVersion: 3）
  lessons/01-intro.mdx     # 章节正文（每章一个 .mdx）
  lessons/02-lab.mdx
  assessments/*.server.json# 正式知识检查题库（仅服务端读取）
  validators.ts            # 模拟实验服务端验证器
  concepts/*.tsx           # 课程插件动画
  activities/*.tsx         # 课程插件原生模拟实验
```

`<course-slug>` 必须与 `course.json` 的 `slug` 一致，且匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。

## 2. course.json

```json
{
  "schemaVersion": 3,
  "slug": "http-hands-on",
  "title": "HTTP 协议入门",
  "description": "从一次请求开始理解 HTTP。",
  "version": "1.0.0",
  "plugins": { "concepts": [], "activities": [] },
  "lessons": [
    {
      "slug": "request-response",
      "title": "请求与响应",
      "source": "lessons/04-request-response.mdx",
      "required": true,
      "unit": "消息",
      "blocks": [
        {
          "id": "request-lab",
          "kind": "simulation",
          "activityId": "http-hands-on/request-lab",
          "title": "构造一个请求"
        },
        {
          "id": "request-check",
          "kind": "question",
          "source": "assessments/request-check.server.json",
          "title": "请求知识检查"
        }
      ],
      "completion": {
        "mode": "all",
        "requiredBlocks": ["request-lab"]
      }
    },
    {
      "slug": "final-quiz",
      "title": "最终测验",
      "source": "lessons/09-final-quiz.mdx",
      "required": true,
      "finalExam": true,
      "blocks": [
        {
          "id": "final-quiz",
          "kind": "question",
          "source": "assessments/final.server.json"
        }
      ],
      "completion": { "mode": "all", "requiredBlocks": ["final-quiz"] }
    }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `schemaVersion` | 是 | 必须是 `3`；v2 不再接受 |
| `slug` / `title` / `description` | 是 / 是 / 否 | 课程标识与元数据 |
| `version` | 是 | semver，同步后写入 `courses.content_version` |
| `lessons` | 是 | 至少 1 个；数组顺序即章节顺序 |
| `lesson.slug` / `title` | 是 | 章节目录中的名称；`title` 允许换行展示 |
| `lesson.source` | 是 | 课程目录内相对路径，必须以 `.mdx` 结尾 |
| `lesson.required` | 否 | 默认 `true`；课程至少 1 个必修 |
| `lesson.unit` | 否 | 可选逻辑分组，只写入 `config.unit`，不增加表 |
| `lesson.blocks` | 否 | `simulation` 或 `question`；未声明的 Block 不能提交 |
| `lesson.completion` | 否 | `manual | all | any`；省略即手动完成 |
| `lesson.finalExam` | 否 | 最多一个；必须是必修、必须包含必需的知识检查 Block |

### 结构规则（`pnpm courses:validate` 强制）

- 每章必须有 `.mdx` 正文，路径不得逃出课程目录。
- 至少一个必修章节。
- **最终测验可选**：0 或 1 个 `finalExam`，不再强制每门课程都有。
- `all/any` 完成规则至少引用一个 Block，且 `requiredBlocks` 必须存在；`manual` 不能声明 required 项。
- 只有 `simulation` / `question` 可以进入 `requiredBlocks`；动画与 MiniCheck 不参与正式判定。
- 模拟 Block 的 `activityId` 必须在生成的 activity registry 中注册，且服务端 validator 可用。
- Block ID 在章节内唯一；MDX 必须实际渲染声明的 Block。
- MDX 使用 AST 解析校验，未知组件、未注册 Concept/Activity、重复 Block 都会失败。
- 客户端组件不能导入 `validators.ts`、`*.server.json` 或 `assessments/`。

### 2.1 完成规则

| `completion.mode` | 行为 |
| --- | --- |
| 省略 / `manual` | 学生阅读后手动标记完成；可选 Block 不影响完成 |
| `all` | 全部 `requiredBlocks` 通过后，服务端自动结章 |
| `any` | 任一 `requiredBlocks` 通过后，服务端自动结章 |

- 通过状态只由服务端验证器/题库评分产生；客户端不能提交 `passed`。
- 首次结章 +10；`finalExam` 章节首次通过额外 +50。
- 动画播放、文字阅读、MiniCheck 不默认参与完成判定。

## 3. MDX 图文

- 仅渲染仓库内**可信** MDX；不要在此放用户上传内容。
- 支持 GFM 表格、代码块、引用、列表。
- 可用的自定义组件：

```mdx
<Callout type="warning" title="注意">
注入的本质是数据被当成了语法。
</Callout>
```

`type`: `note | tip | warning`。

混合章节还可以使用：

```mdx
<ConceptPlayer conceptId="http-hands-on/message" blockId="flow-1" />
<SimulationBlock blockId="request-lab" />
<KnowledgeCheck blockId="request-check" />
```

- `blockId` 必须与 manifest `blocks[].id` 一致；同一章内唯一。
- 动画可多次使用，只要 `blockId` 不同。
- `MiniCheck` 仍然不计分；正式知识检查用 `KnowledgeCheck`。

- 页面标题由播放器渲染，MDX 内不要再写一级标题。
- 图片可使用相对/绝对 URL；MVP 不使用 Supabase Storage，建议内联为代码或外链可信资源。

## 4. 题库 quiz.server.json

```json
{
  "passScore": 70,
  "questions": [
    {
      "id": "q-structure",
      "prompt": "SQL 注入的根本原因是什么？",
      "type": "single",
      "options": [
        { "id": "a", "label": "特殊字符" },
        { "id": "b", "label": "输入被当作语法" }
      ],
      "answer": "b",
      "explanation": "可选，仅服务端保留"
    },
    {
      "id": "q-multi",
      "prompt": "哪些是纵深防御？",
      "type": "multiple",
      "options": [
        { "id": "a", "label": "最小权限" },
        { "id": "b", "label": "返回数据库错误" },
        { "id": "c", "label": "输入校验" }
      ],
      "answer": ["a", "c"]
    }
  ]
}
```

- `passScore` 0–100；得分 = 正确题数 / 总题数 × 100，保留两位。
- `single` 答案必须是一个选项 id；`multiple` 为选项 id 数组，必须完全匹配（不区分顺序）。
- `answer` 与 `explanation` **只保存在服务端文件**，API 响应和客户端 bundle 都不包含；`pnpm security:scan` 会检查解析文本是否泄漏。
- 失败可重试；同一 `attemptId` 幂等；首次通过才发分。

## 5. 服务端验证器

在 `content/courses/<slug>/validators.ts` 导出纯函数：

```ts
export function validateMyLab(submission: unknown): {
  passed: boolean;
  feedback: Record<string, unknown>;
} {
  const list = (submission as { steps?: unknown })?.steps;
  if (!Array.isArray(list)) {
    return { passed: false, feedback: { message: "提交格式无效" } };
  }
  // 完全由服务端重新计算，不信任客户端上报的 passed/score
  const safe = list.every((step) => step === "parameterize");
  return {
    passed: safe,
    feedback: { message: safe ? "通过" : "仍有注入风险" },
  };
}
```

在 `course.json` 的 `plugins.activities` 中声明 validator 路径与导出名；`pnpm courses:prepare` 会生成静态 registry 与服务端 validator registry：

```json
{
  "id": "my-lab",
  "component": "activities/my-lab.tsx",
  "export": "MyLab",
  "validator": { "path": "validators.ts", "export": "validateMyLab" }
}
```

- validatorId 由课程 slug 与活动 id 组成（例如 `my-course/my-lab`），禁止根据用户输入动态 import。
- 验证器只返回 `passed` 与可展示的 `feedback`；不要返回答案或密钥。
- `server_validated` 章节只有验证器通过才会完成并发 10 分；失败可再次提交。

## 6. 原生互动组件与 Learning SDK

互动实验是主应用内的 React 组件，与主站同源，不使用 iframe、postMessage 或独立静态站点。概念动画与混合内容（文字 + 动画 + 知识检查）的完整作者指南见 [`teaching-design.md`](teaching-design.md)。

### 混合内容

文章 MDX 可以直接组合 `<ConceptPlayer>` 与 `<MiniCheck>`，顺序由 MDX 控制；旧的纯 Markdown 文章继续可用。`ConceptPlayer` 的 `conceptId` 必须在 `lib/education/concepts.ts` 与 `components/concepts/registry.tsx` 注册；`pnpm courses:validate` 会拒绝未注册 ID。

### 6.1 目录

```text
lib/activities/
  catalog.ts                 # activityId → validatorId（服务端可安全导入）
  sql-injection.ts           # 纯 TypeScript 模拟与校验
  idempotency.ts
components/activities/
  registry.tsx               # 生成的活动/概念动态组件注册点
  status.tsx                 # 实验保存/冲突状态
  sql-injection/index.tsx
  idempotency/index.tsx
```

- `lib/generated/course-catalog.ts` 与 `validator-registry.server.ts` 由 `pnpm courses:prepare` 生成，禁止手工维护。
- `registry.tsx` 由生成器显式列出每个 `activityId` 对应的组件；禁止根据路径或用户输入动态 import。
- 独立实验不再作为章节类型存在；在 MDX 中用 `<SimulationBlock blockId="..." />` 嵌入普通章节。
- 模拟计算放在纯函数模块，便于单元测试，并与服务端 validator 共用，避免客户端/服务端判定漂移。

### 6.2 组件契约

```tsx
"use client";

import { useLearning } from "@/lib/learning/context";
import { useActivityState } from "@/lib/learning/hooks";

export function MyActivity({ readOnly }: { readOnly: boolean }) {
  const { sdk } = useLearning();
  const { state, setState, status, error, conflict, reload } = useActivityState(
    initialState,
    normalize,
  );

  // 用户操作
  sdk.track("step_completed", { variant: "parameterized" }, "step-2");

  // 提交服务端 validator
  const result = await sdk.submit({ steps: state.steps });
  if (result.passed) await sdk.complete("audit");
}
```

- 服务端学习页渲染 `ActivityHost`，传入 `activityId`、`lessonId`、`enrollmentId`、初始状态/版本与 `readOnly`。
- `LearningProvider` 自动绑定当前 enrollment 与 lesson；组件不能选择学生身份。
- 状态保存、防抖、串行化、版本冲突和重开恢复由 SDK/`useActivityState` 统一处理。
- 组件可以自由使用 SVG、Canvas、动画、表单、状态机；不得使用 `eval` 或执行用户输入脚本。

### 6.3 SDK API

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `start()` | `void` | 记录 `session_start`；可重复调用 |
| `track(type, payload?, stepId?)` | `void` | 事件遥测；payload 完整持久化到 `activity_events` |
| `saveState(state)` | `Promise<{version}>` | 600ms 防抖 + 版本乐观锁；冲突返回 409 |
| `complete(stepId?)` | `Promise<{recorded}>` | `server_validated` 返回 `recorded:false`，完成由 submit 决定 |
| `submit(submission)` | `Promise<{passed, feedback}>` | 服务端 validator 重新判定 |
| `refreshState()` | `Promise<snapshot>` | 冲突后重新读取服务端状态 |

- 事件 payload 会上报 `type`、`payload`、`stepId`、时间、student/course 关联；客户端事件只是遥测，不是可靠的过关证明。
- `saveState` 的 `version` 由服务端维护；多标签或快速操作发生冲突时，UI 必须提示并可重新加载。
- 页面卸载时 SDK 使用 `keepalive` 尽力保存最后一次状态。

## 7. 新增互动组件的步骤

1. 在 `lib/activities/` 编写纯模拟/校验逻辑，并补单元测试。
2. 在 `content/courses/<slug>/validators.ts` 调用该纯函数，返回 `passed` 与 `feedback`。
3. 在课程 `course.json` 的 `plugins.activities` 声明 component/export/validator；`pnpm courses:prepare` 自动生成 catalog 与 registry，不要手工维护注册表。
4. 在 `content/courses/<slug>/activities/` 实现 React 组件，使用 `useLearning`/`useActivityState`；混合章节中组件会自动获得 block-scoped SDK。
5. 在 interactive 章节或 v3 simulation Block 中填写全局 `activityId`。
8. 执行 `pnpm courses:validate`、`pnpm typecheck`、`pnpm test`、`pnpm build` 和 E2E。

## 8. 校验、同步与发布

```bash
pnpm courses:validate
pnpm courses:sync            # 新课程默认 draft，保留已有发布状态
pnpm courses:sync --publish  # 显式发布（演示/种子）
```

- 已有 enrollment 的课程：**禁止**改变必修章节集合、顺序、类型，以及 v3 的必需 Block、完成模式、validator 指纹和必需题库哈希；同步会失败并提示使用新 slug。
- 允许普通文案、可选动画、非必需 Block、不影响完成条件的 UI 修改原地更新。
- v3 章节的 `config.blocks/completion/chapterHash` 由 `courses:sync` 写入；服务端 Block 完成判定只读该配置与 `block_results`。
- 结构性调整：复制目录为新 slug，发布新课程；旧课程保留历史记录。
- 管理端 `/admin/courses` 发布时会再次校验结构与 validator。

## 9. 发布前检查清单

- [ ] `pnpm courses:validate` 通过。
- [ ] `pnpm courses:sync` 成功，课程在 `/admin/courses` 为 `published`。
- [ ] 图文无一级标题，代码块/表格渲染正常。
- [ ] 交互实验/模拟组件在同一章节内按需加载，`BlockScope` 与 Learning SDK 正常。
- [ ] 刷新/关闭重开能恢复状态。
- [ ] 错误提交返回失败，正确提交由服务端判定通过。
- [ ] 测验及格线合理，答案未出现在 API 响应/客户端资源。
- [ ] 完成全部必修后课程结课、积分正确（每章 10 + 最终测验 50）；混合章节多个 Block 只发一次章节积分。

## 共用组件与制作流程

- 实验外壳：`components/education/lab-kit.tsx`（`Ticket` 工单、`LabFooter` 提交与验证结果、`useLabSubmit`、`Verdict`）。
- 概念动画基础组件：`components/education/scene-kit.tsx`（`Node`、`Lane`、`MessageLines`、`Chip`、`Segmented`），只用主题 token，支持暗色与 reduced-motion。
- 只属于某门课的组件（如 HTTP 课的请求工作台）留在该课程目录内，不要让一门课去 import 另一门课的文件。
- 从设计到验证的完整流程、实验类型与已知的坑见 `.claude/skills/learnos-course-authoring/SKILL.md`；`content/courses/http-hands-on/` 是按该流程制作的完整样例。

## 学习路线

学习路线把几门课程按推荐顺序串起来，定义在 `content/paths/<slug>/path.json`：

```json
{
  "schemaVersion": 1,
  "slug": "computer-foundations",
  "title": "计算机基础入门",
  "description": "……",
  "level": "入门",
  "courses": [
    { "course": "bits-and-bytes", "summary": "这一站解决什么问题，一句话。" },
    { "course": "networking-basics", "title": "网络基础：数据包怎么到达", "summary": "……" }
  ]
}
```

- `courses` 的顺序就是推荐顺序。学生可以跳着学，平台不锁定，“同时只学一门课”的规则不变。
- 还没有课程目录的条目必须写 `title`，页面上显示为“即将上线”；课程上线后可以删掉 `title`，以课程自己的标题为准。已存在但未发布的课程同样显示为“即将上线”。
- 路线不存数据：学生在路线上的进度由报名记录推出（已完成几门、推荐下一门）。
- `pnpm courses:validate` 同时校验路线：目录名与 slug 一致、课程不重复、未上线的条目有标题。
- 新课程做好后，记得把它加进合适的路线，或者把路线里对应的“即将上线”条目换成正式课程。
