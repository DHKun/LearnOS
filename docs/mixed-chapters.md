# 混合章节制作指南（Manifest v3）

> 本指南面向课程作者。核心原则：**MDX 负责内容顺序与排版，Manifest 只声明需要验证的 Block 和完成条件。**

## 1. Course → Chapter → Block

```text
Course
  └── Chapter（数据库 lessons + lesson_progress，沿用原有 ID）
        ├── MDX 文字 / 图片 / 代码 / 表格 / 公式 / SVG
        ├── ConceptPlayer（可选、可多个、只做教学展示）
        ├── SimulationBlock（可选、可多个，浏览器 JS 模拟）
        ├── MiniCheck（可选、不计分、即时反馈）
        └── KnowledgeCheck（可选、可多个、服务端正式判分）
```

- 纯文字章节合法。
- 只有动画的章节合法。
- 只有实验的章节合法。
- 只有知识检查的章节合法。
- 同一章多个动画、多个实验、多个知识检查都合法。
- **不要**为了普通段落、图片或表格声明 JSON Block；它们直接写在 MDX 里。

## 2. Manifest v3

```json
{
  "schemaVersion": 3,
  "slug": "http-from-zero",
  "title": "HTTP 协议入门",
  "version": "1.0.0",
  "plugins": {
    "concepts": [
      {
        "id": "request-flow",
        "component": "concepts/http-concepts.tsx",
        "export": "RequestFlow",
        "title": "一次 HTTP 请求的旅程"
      }
    ],
    "activities": [
      {
        "id": "request-builder",
        "component": "activities/http-activities.tsx",
        "export": "RequestBuilderActivity",
        "validator": {
          "path": "validators.ts",
          "export": "validateRequestBuilder"
        }
      }
    ]
  },
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
          "activityId": "http-from-zero/request-builder",
          "title": "构造 GET /users/1"
        }
      ],
      "completion": {
        "mode": "all",
        "requiredBlocks": ["request-lab"]
      }
    }
  ]
}
```

- `plugins` 可以整个省略，纯文字课程不需要任何插件。
- `blocks` 可以省略或为空。
- `schemaVersion: 2` 继续支持旧课程；v3 才能使用 `blocks` / `completion`。
- `lesson.type` 继续使用 `article` / `interactive` / `quiz`。混合章节推荐 `article`。
- 原有独立 `interactive` / `quiz` 章节不需要迁移。

## 3. Block 类型

### 3.1 simulation

```json
{
  "id": "request-lab",
  "kind": "simulation",
  "activityId": "http-from-zero/request-builder",
  "title": "构造 GET /users/1"
}
```

- `activityId` 指向 `plugins.activities` 中的活动。
- 服务端必须有对应 validator。
- 浏览器内模拟可以任意交互；正式通过由服务端 validator 重新计算。
- MDX 中必须渲染一次：

```mdx
<SimulationBlock blockId="request-lab" />
```

也可以写 `activityId` prop，但必须与 manifest 一致；推荐只写 `blockId`。

### 3.2 question

```json
{
  "id": "methods-check",
  "kind": "question",
  "source": "assessments/methods-check.server.json",
  "title": "方法知识检查",
  "passScore": 60
}
```

- `source` 是课程目录内的题库文件；支持单选、多选、判断题。
- 正确答案与解析只在服务端读取。
- MDX 中必须渲染一次：

```mdx
<KnowledgeCheck blockId="methods-check" />
```

- 可重复提交；失败可重试；通过后服务端记录 Block 结果。

## 4. 完成规则

```json
"completion": {
  "mode": "all",
  "requiredBlocks": ["request-lab", "methods-check"]
}
```

| mode | 含义 | completionPolicy |
| --- | --- | --- |
| `manual` | 学生阅读后手动完成；Block 可以是可选练习 | `manual` |
| `all` | 所有 `requiredBlocks` 通过后自动完成 | `server_validated` |
| `any` | 任意一个 `requiredBlocks` 通过后自动完成 | `server_validated` |

规则：

- `requiredBlocks` 必须引用真实存在的 Block。
- `all/any` 不能为空，且章节必须 `server_validated`。
- `manual` 不能声明 `requiredBlocks`。
- `server_validated` 章节省略 `completion` 且声明了 blocks 时，默认等价于 `all`（推荐显式写出）。
- 纯文字手动章节没必要写 `completion`。

## 5. MDX 组件

### ConceptPlayer（可选、可多个）

```mdx
<ConceptPlayer conceptId="http-from-zero/request-flow" blockId="flow-1" />
```

- `blockId` 应该在同一章内唯一；它同时是状态命名空间。
- 同一个概念可以出现多次，但必须使用不同 `blockId`。
- 动画本身不发积分，也不能作为 `all/any` 的必需 Block。

### MiniCheck（不计分）

```mdx
<MiniCheck
  id="url-check"
  question="哪个部分是路径？"
  options={["example.test", "/users/1", "?tab=notes"]}
  answer={1}
  explanation="路径是 /users/1。"
/>
```

- 客户端包含答案，只用于即时反馈。
- 不影响章节完成，也不能替代 KnowledgeCheck。

### SimulationBlock

```mdx
<SimulationBlock blockId="request-lab" />
```

### KnowledgeCheck

```mdx
<KnowledgeCheck blockId="methods-check" />
```

## 6. Block 状态

所有 Block 共享同一份 Lesson State，但使用 `blockId` 命名空间：

```json
{
  "schemaVersion": 2,
  "blocks": {
    "flow-1": { "conceptStep": 2, "conceptCompleted": false },
    "request-lab": { "method": "GET", "path": "/users/1", "passed": true },
    "methods-check": { "answers": { "q1": "post" } }
  }
}
```

- 多个 Concept / Simulation / KnowledgeCheck 不会互相覆盖。
- 统一使用 `useBlockState(initial, normalize)`（内部复用 `useActivityState` 的 600ms 防抖与版本乐观锁）。
- 旧版扁平 Concept 状态会被迁移到第一个 concept Block；后续保存会写入 v2 命名空间。
- 刷新、关闭后重开、多标签版本冲突、只读复习继续由现有 Learning SDK 处理。
- 单章状态仍受 64KB 限制。

## 7. 服务端验证

章节 Block 提交：

```http
POST /api/learning/blocks/submit
Content-Type: application/json

{
  "attemptId": "uuid",
  "enrollmentId": "uuid",
  "lessonId": "uuid",
  "blockId": "methods-check",
  "submission": { "answers": { "q1": "post" } }
}
```

- 服务端校验学生身份、enrollment 所有权、lesson 归属、Block 声明和类型。
- simulation：调用注册的 validator。
- question：用服务端题库评分。
- `passed` 由服务端计算，客户端提交 `passed: true` 不会生效（schema 拒绝额外字段）。
- 结果写入 `block_attempts` / `block_results`，按 attempt ID 幂等。
- 满足 `all/any` 后，在同一个事务中完成章节并发放首次完成 +10；重复 Block 不会重复发分。

## 8. 模板

### 8.1 纯理论章节

```json
{
  "slug": "intro",
  "title": "介绍",
  "type": "article",
  "source": "lessons/01-intro.mdx",
  "completionPolicy": "manual",
  "required": true
}
```

```mdx
## 概念

一段文字。

![示意图](/diagram.svg)
```

### 8.2 动画章节

```json
{
  "slug": "flow",
  "title": "请求流程",
  "type": "article",
  "source": "lessons/02-flow.mdx",
  "completionPolicy": "manual",
  "required": true
}
```

```mdx
<ConceptPlayer conceptId="http-from-zero/request-flow" blockId="flow-1" />
```

### 8.3 实验章节

声明 simulation Block，`all` 只要求该 Block。

### 8.4 答题章节

声明 question Block，`all` 只要求该 Block。

### 8.5 综合章节

同一个 MDX 中按教学顺序组合 ConceptPlayer、文字、SimulationBlock、文字、KnowledgeCheck。`all` 同时要求实验与检查；`any` 表示二者通过其一即可。

## 9. 校验与冻结

`pnpm courses:validate` 会：

- 解析 MDX AST，而不是用正则扫描标签。
- 拒绝未注册的 Concept / Activity / Block。
- 拒绝声明但没有在 MDX 渲染的 Block、重复渲染、类型不匹配。
- 拒绝客户端组件导入 `validators.ts`、`*.server.json` 或 `assessments/`。
- 校验题库、判断题、路径、符号链接与最终测验。
- 对已有学习记录的课程冻结必需 Block、validator 指纹、题库哈希和完成规则。
- 允许普通文案/可选动画/不影响完成条件的可选 Block 变化。

`pnpm courses:sync` 将 `blocks` / `completion` / `chapterHash` 写入 `lessons.config`，服务端完成判定不依赖客户端状态。
