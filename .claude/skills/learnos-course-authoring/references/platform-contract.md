# LearnOS 课程平台契约

写代码前读一遍。权威来源是 `docs/MVP-SPEC.md`、`docs/mixed-chapters.md`、`docs/course-authoring.md`；本文只汇总做课时最常用的部分，以及文档里没写清的坑。

## 目录

1. 课程目录结构
2. course.json（Manifest v3）
3. MDX 章节
4. 概念动画
5. 模拟实验组件
6. 服务端校验器
7. 题库
8. 积分与完成
9. 冻结规则与发布
10. 主题与样式
11. 学习路线
12. 常用命令

## 1. 课程目录结构

```text
content/courses/<slug>/
  course.json              # Manifest v3
  README.md                # 设计思路、章节表、判分说明（给作者和评审看）
  lessons/NN-<slug>.mdx    # 每章一个
  concepts/*.tsx           # 概念动画（客户端）
  activities/*.tsx         # 模拟实验（客户端）
  simulation/*.ts          # 纯函数：模拟引擎 + 判分规则，前后端共用
  validators.ts            # 服务端校验器，只在服务端加载
  assessments/*.server.json  # 服务端题库，答案不下发
```

`<slug>` 必须与目录名一致，并匹配 `^[a-z0-9]+(-[a-z0-9]+)*$`。

平台级的共用组件放在 `components/education/`：`concept-frame.tsx`、`mini-check.tsx`、`lab-kit.tsx`、`scene-kit.tsx`。课程只引用它们，不要复制。

## 2. course.json（Manifest v3）

```json
{
  "schemaVersion": 3,
  "slug": "my-course",
  "title": "课程名",
  "description": "一两句话：学完能做什么，实验在哪里进行。",
  "version": "1.0.0",
  "plugins": {
    "concepts": [
      { "id": "journey", "component": "concepts/my-concepts.tsx", "export": "JourneyConcept", "title": "…", "analogy": "…" }
    ],
    "activities": [
      {
        "id": "url-lab", "component": "activities/labs.tsx", "export": "UrlLab", "title": "…",
        "validator": { "path": "validators.ts", "export": "validateUrlLab" }
      }
    ]
  },
  "lessons": [
    { "slug": "intro", "title": "…", "source": "lessons/01-intro.mdx", "required": true, "unit": "基础" },
    {
      "slug": "url", "title": "…", "source": "lessons/02-url.mdx", "required": true, "unit": "基础",
      "blocks": [
        { "id": "url-lab", "kind": "simulation", "activityId": "my-course/url-lab", "title": "…" },
        { "id": "url-check", "kind": "question", "source": "assessments/url.server.json", "title": "…", "passScore": 75 }
      ],
      "completion": { "mode": "all", "requiredBlocks": ["url-lab", "url-check"] }
    },
    {
      "slug": "final", "title": "结业测验", "source": "lessons/09-final.mdx", "required": true, "unit": "结业",
      "blocks": [{ "id": "final-check", "kind": "question", "source": "assessments/final.server.json", "passScore": 80 }],
      "completion": { "mode": "all", "requiredBlocks": ["final-check"] },
      "finalExam": true
    }
  ]
}
```

- 概念和活动的全局 ID 是 `<slug>/<id>`。`activityId` 要写全局 ID，`ConceptPlayer` 的 `conceptId` 也是。
- 省略 `completion` 表示手动完成（章末出现“标记本章完成”按钮）。
- `unit` 决定学习页目录的分组：课程有 2 个及以上单元时，目录默认只展开当前章节所在的单元。单元名尽量短。
- `pnpm courses:prepare` 会根据所有课程生成 `lib/generated/*`。不要手改这些文件，但要把重新生成的结果一起提交。
- **组件文件不能 import 校验器或题库**：生成器会拒绝在组件文件里出现 `validators`、`.server.json`、`assessments/` 的导入。判分规则放在 `simulation/` 里，就能被前后端共用。

## 3. MDX 章节

可用组件（`components/mdx.tsx`）：

```mdx
<Callout type="note|tip|warning" title="…">正文</Callout>

<ConceptPlayer conceptId="my-course/journey" blockId="journey" />

<SimulationBlock blockId="url-lab" />

<KnowledgeCheck blockId="url-check" />

<MiniCheck
  id="third-page"
  question="…？"
  options={["选项 A", "选项 B", "选项 C"]}
  answer={1}
  explanation="为什么。答错和答对都会显示。"
/>
```

- manifest 里声明的每个 Block 必须在 MDX 中**恰好渲染一次**，也不能渲染未声明的 Block；`courses:validate` 会检查。
- `MiniCheck` 不计分，答案在前端，只用于即时反馈。
- 章节标题（`##` / `###`）会成为学习页目录里的本章大纲，id 由 github-slugger 生成：去掉标点，中文保留。例如“动手：两天的缓存回放”的 id 是 `动手两天的缓存回放`。标题要短，因为目录里位置有限。
- 可以写 `<details><summary>…</summary>…</details>` 做“卡住了？展开看提示”，内部要留空行，Markdown 才会被解析。
- 正文里出现 `{`、`<` 要放进行内代码或代码块，否则 MDX 会把它当成表达式或标签。
- 正文渲染在 prose 容器里，组件中的 `<ul>` 和 `<table>` 会继承 prose 样式。

## 4. 概念动画

```tsx
"use client";
import { ConceptFrame, type ConceptStep } from "@/components/education/concept-frame";
import type { ConceptId } from "@/lib/education/concepts";
import { Lane, MessageLines, Node, Segmented } from "@/components/education/scene-kit";

export function JourneyConcept() {
  const steps: ConceptStep[] = [{ title: "…", description: "…" } /* … */];
  return (
    <ConceptFrame
      conceptId={"my-course/journey" as ConceptId}
      blockId="concept-journey"
      title="…"
      analogy="…"                 // 全课统一的比喻
      steps={steps}
      scenes={steps.map((_, i) => <Scene key="scene" step={i} />)}  // 同一组件、同一个 key，切换步骤时 CSS 过渡才会生效
      mapping={[{ analogy: "…", real: "…", covers: "…" }]}          // 类比与真实对象的对照，以及类比能解释到哪一步
      insight="一句话原理总结"
      controls={/* 可选：Segmented 等，让学生切换条件 */ undefined}
    />
  );
}
```

`ConceptFrame` 已经提供播放、暂停、单步、重播和 reduced-motion 下的静态替代，并会保存学生看到第几步。动画本身不计分。

## 5. 模拟实验组件

```tsx
"use client";
import { LabFooter, Ticket, useLabSubmit } from "@/components/education/lab-kit";
import { useActivityState } from "@/lib/learning/hooks";
import type { ActivityComponentProps } from "@/lib/learning/types";

type State = { config: Config; passed: boolean };
const INITIAL: State = { config: BROKEN_CONFIG, passed: false };
function normalize(value: unknown): State { /* 容忍任意输入，回退到 INITIAL 的各字段 */ }

export function MyLab({ readOnly }: ActivityComponentProps) {
  const { state, setState, ...save } = useActivityState<State>(INITIAL, normalize);
  const { submit, pending, last } = useLabSubmit();
  const locked = readOnly || state.passed;
  const live = evaluate(state.config);   // 和服务端相同的判分规则，用于即时反馈
  return (
    <div className="space-y-5" data-testid="my-course-my-lab">
      <Ticket goal="可验证的目标">症状描述</Ticket>
      {/* 控件，加 aria-label；结果实时显示 */}
      <LabFooter save={save} passed={state.passed} pending={pending} readOnly={readOnly}
        label="提交…" last={last}
        onSubmit={() => void submit({ ...state.config }, "my_lab_submitted").then((ok) => ok && setState((s) => ({ ...s, passed: true })))} />
    </div>
  );
}
```

- `useActivityState` 会自动保存状态（基于 `expectedVersion` 乐观锁）。多标签页冲突时显示“重新加载最新状态”，保存逻辑不用自己写。
- 存档里的 `passed` 只控制界面，比如锁定控件；是否通过只由服务端判定。
- `readOnly` 为 true 时是只读复习模式（课程已结课）：控件全部禁用，但结果仍要能看。
- `data-testid` 约定为 `<slug>-<lab>`，供 E2E 定位。

## 6. 服务端校验器

```ts
/** Server-side validators. Never imported by a client component. */
type Verdict = { passed: boolean; feedback: Record<string, unknown> };

export function validateMyLab(input: unknown): Verdict {
  const config = parseStrict(input);          // 类型、枚举、长度、数量，任一不符就返回不通过
  if (!config) return { passed: false, feedback: { message: "格式不正确。" } };
  const result = gradeMyLab(config);          // 来自 simulation/，与前端相同的判分规则
  return { passed: result.passed, feedback: { message: result.message } };
}
```

- 校验器是同步纯函数，不访问数据库和网络，也拿不到学生身份。
- `feedback.message` 会显示给学生：失败时指出原因，但不直接给出答案。
- 服务端 `/api/learning/blocks/submit` 负责幂等（同一个 attemptId 重放时返回原结果）、章节完成判定和积分发放，校验器不用管这些。

## 7. 题库

```json
{
  "passScore": 75,
  "questions": [
    { "id": "q1", "prompt": "…", "type": "single", "options": [{ "id": "a", "label": "…" }], "answer": "a", "explanation": "…" },
    { "id": "q2", "prompt": "…", "type": "multiple", "options": [ … ], "answer": ["a", "c"], "explanation": "…" },
    { "id": "q3", "prompt": "…", "type": "boolean", "answer": false, "explanation": "…" }
  ]
}
```

- 判断题在前端显示为两个选项，id 分别是 `"true"` 和 `"false"`。
- 文件里的 `passScore` 与 manifest 中 Block 的 `passScore` 保持一致。
- 同一文件内题目 id 唯一。章节小测 4 题左右；结业测验 20 题，80 分及格。

## 8. 积分与完成

每章首次完成 +10，结业测验首次通过再加 +50，重复提交不会重复发分。`completion.mode: "all"` 要求 `requiredBlocks` 全部通过后才自动结章；手动章节由学生点击按钮完成。所有必修章节完成后自动结课。

## 9. 冻结规则与发布

- 课程有学习记录后，`courses:sync` 会比较以下内容：章节 slug、顺序、是否必修、类型；完成规则；`finalExam`；题库内容哈希；`activityId`；`validators.ts` 的源码哈希。任何一项不同都会拒绝同步，提示改用新 slug。
- 指纹**只覆盖 `validators.ts` 本身**：`simulation/` 里的判分规则变了，同步时不会报错。改动判分规则时，自己按结构性变更处理。
- 可以原地修改：文案、动画、可选 Block、展示细节。修改后递增 `version`，否则部署扫描会提示“源码变了但版本号没变”。
- 新课程：`pnpm courses:sync` 默认是草稿，`--publish` 直接发布；部署控制台使用 `--publish-new`。
- 从仓库删除一门已部署的课程，会阻塞部署扫描。需要按 `docs/decisions.md` D44 的流程处理数据库（先备份，再删除报名级联数据和课程行，最后重建基线）。这是生产数据操作，交给用户执行。

## 10. 主题与样式

- 只用主题 token：`bg-card`、`bg-muted`、`border-border`、`text-muted-foreground`、`text-primary`、`bg-primary/10`、`text-success`、`bg-success/10`、`text-warning`、`bg-warning/10`、`text-destructive`。不要写死十六进制颜色。
- 代码和报文可以用固定的深色块（`bg-slate-950 text-slate-100`），亮色和暗色模式下都清楚。
- 过渡动画加 `motion-safe:` 前缀。
- 窄屏：多栏布局用 `grid-cols-1 sm:grid-cols-[…]`，宽表格包在 `overflow-x-auto` 里。

## 11. 学习路线

路线定义在 `content/paths/<slug>/path.json`，字段和规则见 `docs/course-authoring.md` 的“学习路线”一节。要点：顺序即推荐顺序、不锁定；未上线的条目必须有 `title`；进度由报名记录推出，路线本身不存数据；`courses:validate` 会校验路线。

## 12. 常用命令

```bash
pnpm courses:validate        # manifest、MDX、Block、题库、插件注册
pnpm typecheck && pnpm lint
pnpm vitest run tests/unit/<slug>.test.ts
pnpm test:e2e tests/e2e/<slug>.spec.ts
pnpm build && pnpm security:scan   # 检查客户端资源里有没有答案或密钥
```
