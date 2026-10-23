# 课程制作与互动组件接入

LearnOS 采用**内容即代码**：课程结构、MDX、题库与服务端验证器都在仓库中，经脚本校验后同步到数据库。管理员 UI 只管理发布状态与标题/简介，不编辑章节内容。

> **Manifest v3 混合章节**：一个章节可以用 MDX 自由组合文字、图片、动画、JS 模拟实验和知识检查。完整字段、模板和 Block 状态模型见 [`mixed-chapters.md`](mixed-chapters.md)。v2 课程继续完全兼容。

## 1. 目录结构

```text
content/courses/<course-slug>/
  course.json              # 课程 manifest
  01-intro.mdx             # 图文章节
  02-principle.mdx
  quiz.server.json         # 最终测验题库（含答案，仅服务端读取）
  assessments/*.server.json# v3 章节知识检查题库（仅服务端读取）
  validators.ts            # 互动组件/模拟 Block 服务端验证器
  concepts/*.tsx           # 课程插件动画
  activities/*.tsx         # 课程插件原生模拟实验

components/activities/     # activityId registry 与原生 React 组件
lib/activities/            # 纯模拟/校验逻辑与活动目录
```

`<course-slug>` 必须与 `course.json` 的 `slug` 一致，且匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。

## 2. course.json

```json
{
  "slug": "sql-injection-basics",
  "title": "SQL 注入：从字符串拼接到参数化查询",
  "description": "从登录框出发理解注入与参数化。",
  "version": "1.0.0",
  "lessons": [
    {
      "slug": "where-injection-comes-from",
      "title": "注入从哪里来",
      "type": "article",
      "source": "01-where-injection-comes-from.mdx",
      "completionPolicy": "manual",
      "required": true
    },
    {
      "slug": "query-audit-lab",
      "title": "实验：审计一条登录查询",
      "type": "interactive",
      "activityId": "sql-injection-lab",
      "completionPolicy": "server_validated",
      "required": true
    },
    {
      "slug": "final-quiz",
      "title": "最终测验",
      "type": "quiz",
      "source": "quiz.server.json",
      "completionPolicy": "server_validated",
      "required": true,
      "finalExam": true
    }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `slug` | 是 | 全课程唯一，小写连字符 |
| `title` / `description` | 是 / 否 | 标题 ≤160；简介 ≤2000 |
| `version` | 是 | semver，同步后写入 `courses.content_version` |
| `lessons` | 是 | 至少 1 个；数组顺序即章节顺序（position 从 0 开始） |
| `required` | 否 | 默认 `true`；课程至少 1 个必修 |
| `unit` | 否 | 可选逻辑分组，写入 `lessons.config.unit`，用于目录分组；不增加表，不参与结构冻结 |
| `type` | 是 | `article` / `interactive` / `quiz` |
| `completionPolicy` | 依类型 | article: `manual`，或带可验证 blocks 的 `server_validated`；interactive: `reported` / `server_validated`；quiz: `server_validated` |
| `source` | article/quiz | 课程目录内相对路径；禁止 `..`、绝对路径 |
| `activityId` | interactive | 必须已注册到 `lib/activities/catalog.ts` 与 `components/activities/registry.tsx` |
| `finalExam` | quiz | **必须且只能有一个**，且必须是最后一个章节 |

### 结构规则（`pnpm courses:validate` 强制）

- 章节 slug 唯一、资源文件存在、路径不得逃出课程目录。
- 至少一个必修章节。
- 恰好一个 `finalExam: true` 的测验，且位于最后。
- 图文章节声明 `server_validated` 时必须带 `blocks` 与可满足的 `completion`；交互章节不能使用 `manual`。
- 每个交互章节/模拟 Block 的 `activityId` 必须在活动目录中注册，且对应服务端 validator 可用。
- v3 的 Block ID 在章节内唯一；`requiredBlocks` 必须引用存在的 Block；MDX 必须实际渲染声明的 Block。
- MDX 使用 AST 解析校验，未知组件、未注册 Concept/Activity、重复 Block 都会失败。
- 客户端组件不能导入 `validators.ts`、`*.server.json` 或 `assessments/`。

### 2.1 Manifest v3 混合章节

```json
{
  "schemaVersion": 3,
  "slug": "http-from-zero",
  "title": "HTTP 协议入门",
  "version": "1.0.0",
  "plugins": { "concepts": [], "activities": [] },
  "lessons": [
    {
      "slug": "request-response",
      "title": "请求与响应",
      "type": "article",
      "source": "lessons/04-request-response.mdx",
      "completionPolicy": "server_validated",
      "required": true,
      "blocks": [
        {
          "id": "request-lab",
          "kind": "simulation",
          "activityId": "http-from-zero/request-builder"
        },
        {
          "id": "request-check",
          "kind": "question",
          "source": "assessments/request-check.server.json"
        }
      ],
      "completion": {
        "mode": "all",
        "requiredBlocks": ["request-lab", "request-check"]
      }
    }
  ]
}
```

- `blocks` / `completion` 省略时就是普通文章章节。
- `completion.mode`: `manual | all | any`；`all/any` 必须 `server_validated`。
- 只有 simulation/question 可以进入 `requiredBlocks`；动画只做展示。
- `plugins` 可省略；纯文字课程不需要任何概念或活动。

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
<ConceptPlayer conceptId="http-from-zero/request-flow" blockId="flow-1" />
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

然后在 `lib/content/validators.server.ts` 的静态注册表中登记：

```ts
import { validateMyLab } from "@/content/courses/my-course/validators";

const VALIDATORS = {
  "my-lab-validator": (submission) => {
    const result = validateMyLab(submission);
    return { passed: result.passed, feedback: result.feedback };
  },
};
```

- 禁止根据 `validatorId` 动态 import 用户输入。
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
  registry.tsx               # activityId → 动态 React 组件（唯一注册点）
  activity-host.tsx          # 绑定 lesson/enrollment/initial state
  sql-injection/index.tsx
  idempotency/index.tsx
```

- `catalog.ts` 是 manifest 校验、同步和服务端验证器的唯一活动清单。
- `registry.tsx` 必须显式列出每个 `activityId` 对应的组件；禁止根据路径或用户输入动态 import。
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
