# 课程制作与实验接入

LearnOS 采用**内容即代码**：课程结构、MDX、题库与服务端验证器都在仓库中，经脚本校验后同步到数据库。管理员 UI 只管理发布状态与标题/简介，不编辑章节内容。

## 1. 目录结构

```text
content/courses/<course-slug>/
  course.json              # 课程 manifest
  01-intro.mdx             # 图文章节
  02-principle.mdx
  quiz.server.json         # 测验题库（含答案，仅服务端读取）
  validators.ts            # 互动实验服务端验证器

apps/labs/<lab-name>/      # 独立静态实验（不同源部署）
  index.html
  app.js
  styles.css

packages/learning-sdk/     # 浏览器 SDK 源码
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
      "entryUrl": "${LABS_ORIGIN}/sql-injection-lab/",
      "completionPolicy": "server_validated",
      "validatorId": "sql-injection-lab",
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
| `type` | 是 | `article` / `interactive` / `quiz` |
| `completionPolicy` | 依类型 | article: `manual`；interactive: `reported` / `server_validated`；quiz: `server_validated` |
| `source` | article/quiz | 课程目录内相对路径；禁止 `..`、绝对路径 |
| `entryUrl` | interactive | 绝对 http(s) URL；可用 `${LABS_ORIGIN}` 占位符；origin 必须在 `LABS_ALLOWED_ORIGINS` 中 |
| `validatorId` | interactive | 必须已注册到 `lib/content/validators.server.ts` |
| `finalExam` | quiz | **必须且只能有一个**，且必须是最后一个章节 |

### 结构规则（`pnpm courses:validate` 强制）

- 章节 slug 唯一、资源文件存在、路径不得逃出课程目录。
- 至少一个必修章节。
- 恰好一个 `finalExam: true` 的测验，且位于最后。
- 图文章节不能声明 `server_validated`；交互章节不能使用 `manual`。
- 每个交互章节的 `validatorId` 必须注册。
- `entryUrl` 解析后必须是 http(s)，且 origin 在允许列表。

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

## 6. 独立实验与 Learning SDK

实验可以是任意前端技术（纯 JS / React / Vue / Canvas / Three.js），构建为静态站点并部署到**与主站不同源**的域名。

页面末尾按顺序加载 SDK 与实验代码：

```html
<script src="/sdk/learning-sdk.js"></script>
<script src="./app.js"></script>
```

开发时把 `learning-sdk.js` 放在实验站点的 `/sdk/` 路径（`pnpm labs:dev` 已自动映射）。

```js
const sdk = window.LearningSDK;

sdk.onRestore((state) => {
  if (state) {
    // 恢复上次保存的步骤/输入
  }
  sdk.start(); // 会话内去重
});

// 用户操作
sdk.track("step_interacted", { variant: "parameterized" }, "step-2");

// 自动保存（SDK 内部 600ms 防抖）
await sdk.saveState({ step: 2, answer: "parameterize" });

// 提交服务端验证器
const { passed, feedback } = await sdk.submit({ defences: ["parameterize"] });
if (passed) {
  await sdk.complete("audit"); // server_validated 时返回 { recorded: false }，由 submit 决定完成
}
```

SDK API：

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `start()` | `void` | 记录会话开始；可重复调用，按会话去重 |
| `track(type, payload?, stepId?)` | `void` | 遥测；类型限小写，payload ≤8KB |
| `saveState(state)` | `Promise<{version}>` | 600ms 防抖；版本由父窗口维护 |
| `complete(stepId?)` | `Promise<{recorded}>` | 仅 manual/reported 章节会记录完成 |
| `submit(submission)` | `Promise<{passed, feedback}>` | 服务端验证器判定 |
| `onRestore(handler)` | `void` | INIT 到达后回调持久化状态或 `null` |

协议与安全（父窗口实现）：

- `protocol: "learnos/1"`，消息含 `nonce` 与 UUID `requestId`。
- 父窗口校验 `event.origin`、`event.source === iframe.contentWindow`、协议、nonce、schema、当前 lesson/enrollment；使用具体 `targetOrigin`，禁止 `*`。
- iframe 不持有 Supabase Token，不直接调用业务 API；所有请求经父窗口桥接。
- 实验不可信：`complete`/事件只是客户端声明；通过/积分只由服务端判定。

## 7. 实验部署

1. `pnpm labs:build` 生成 `packages/learning-sdk/dist/learning-sdk.js`。
2. 将 `apps/labs/<lab>` 与 SDK 部署到独立域名（例如 `https://labs.example.net/sql-injection-lab/`）。
3. 更新 `.env` 的 `NEXT_PUBLIC_LABS_ORIGIN` / `LABS_ALLOWED_ORIGINS`。
4. 将 manifest 的 `entryUrl` 改为 `${LABS_ORIGIN}/...` 或实际 URL，执行 `pnpm courses:sync`。
5. 确认跨域响应允许被主站 iframe（不要在实验站点发送 `X-Frame-Options: DENY`；使用 `frame-ancestors <主站 origin>`）。

## 8. 校验、同步与发布

```bash
pnpm courses:validate
pnpm courses:sync            # 新课程默认 draft，保留已有发布状态
pnpm courses:sync --publish  # 显式发布（演示/种子）
```

- 已有 enrollment 的课程：**禁止**改变必修章节集合、顺序、类型；同步会失败并提示使用新 slug。
- 允许原地修改标题、简介、文案、题库（不改变结构）并递增 `version`。
- 结构性调整：复制目录为新 slug，发布新课程；旧课程保留历史记录。
- 管理端 `/admin/courses` 发布时会再次校验结构与 validator。

## 9. 发布前检查清单

- [ ] `pnpm courses:validate` 通过。
- [ ] `pnpm courses:sync` 成功，课程在 `/admin/courses` 为 `published`。
- [ ] 图文无一级标题，代码块/表格渲染正常。
- [ ] 交互实验能在独立域名打开，`LearningSDK` 已加载。
- [ ] 刷新/关闭重开能恢复状态。
- [ ] 错误提交返回失败，正确提交由服务端判定通过。
- [ ] 测验及格线合理，答案未出现在 API 响应/客户端资源。
- [ ] 完成全部必修后课程结课、积分正确（每章 10 + 最终测验 50）。
