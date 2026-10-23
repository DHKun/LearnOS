# Course Plugin Spec (Manifest v3)

## 1. 目录约定

```text
content/courses/<slug>/
  course.json
  lessons/*.mdx
  assessments/*.server.json
  concepts/*.tsx
  activities/*.tsx
  simulation/*.ts
  validators.ts
  assets/*
```

所有路径必须位于该课程目录内；生成器拒绝 `..`、绝对路径和跨课程引用。组件只能使用项目已审核的 npm 依赖与公共 UI/学习 SDK。

## 2. 唯一模型：Course → Chapter → Block

课程清单必须声明 `schemaVersion: 3`。v2 兼容分支与 `legacyGlobalId` 已删除；所有章节都有 MDX 正文，模拟实验与正式题目作为可选 Block 声明。

```json
{
  "schemaVersion": 3,
  "slug": "http-from-zero",
  "title": "HTTP 协议入门",
  "description": "...",
  "version": "1.0.0",
  "plugins": {
    "concepts": [
      {
        "id": "request-flow",
        "component": "concepts/http-concepts.tsx",
        "export": "RequestFlow",
        "title": "一次 HTTP 请求的旅程",
        "analogy": "寄信与回信"
      }
    ],
    "activities": [
      {
        "id": "request-builder",
        "component": "activities/http-activities.tsx",
        "export": "RequestBuilderActivity",
        "title": "HTTP 请求构造器",
        "validator": { "path": "validators.ts", "export": "validateRequestBuilder" }
      }
    ]
  },
  "lessons": [
    {
      "slug": "request-response",
      "title": "请求与响应",
      "source": "lessons/04-request-response.mdx",
      "required": true,
      "unit": "消息",
      "blocks": [
        { "id": "request-lab", "kind": "simulation", "activityId": "http-from-zero/request-builder" },
        { "id": "request-check", "kind": "question", "source": "assessments/check.server.json", "passScore": 60 }
      ],
      "completion": { "mode": "all", "requiredBlocks": ["request-lab"] }
    }
  ]
}
```

- 插件全局 ID 固定为 `${courseSlug}/${localId}`；不再支持自定义全局 ID。
- `id` 在单个插件内唯一；全局 ID 在所有课程间唯一。
- `component`/`validator.path` 必须是课程目录内的相对路径；`export` 必须真实存在。
- 不允许 URL、远程 JS、任意命令、用户上传代码。
- `blocks` 可省略/为空；纯文字章节仍然合法。
- `completion` 可省略（手动完成）。`all/any` 必须列出 `requiredBlocks`，且只能引用 simulation/question。
- Block `id` 在章节内唯一；MDX 中每个声明 Block 必须且只能渲染一次。
- `finalExam` 可选，最多一个；若声明，必须是必修章节且包含必需的知识检查 Block。
- 题库支持 `single`、`multiple`、`boolean`；boolean 不需要 options，客户端会规范化为“正确/错误”两个选项。

### MDX AST 校验

`pnpm courses:validate` 使用 `remark-parse` + `remark-mdx` 解析 MDX，并按 JSX 元素/属性校验：

- `ConceptPlayer` 的 `conceptId` 必须已在生成的 concept registry 中。
- `SimulationBlock` / `KnowledgeCheck` 的 `blockId` 必须已声明；组件类型必须匹配。
- 声明了 Block 却没有在 MDX 渲染、重复渲染、使用未声明 Block 都会失败。
- 未注册的大写组件失败；`Callout`、`MiniCheck`、`ConceptPlayer`、`SimulationBlock`、`KnowledgeCheck` 是允许集合。
- 客户端组件导入 `validators.ts`、`*.server.json` 或 `assessments/` 会被拒绝，防止答案进入浏览器 bundle。

## 3. 生成物

`pnpm courses:prepare` 扫描所有 `content/courses/*/course.json`，稳定排序生成：

```text
lib/generated/course-catalog.ts          # Concept/Activity ID 与元数据
lib/generated/course-components.tsx      # 动态组件注册
lib/generated/validator-registry.server.ts # 服务端 validator + 源码指纹
```

生成文件不得手工编辑；新增/删除课程后重新生成即可，旧条目会自动清除。

`pnpm courses:validate`、`pnpm courses:sync`、`pnpm build`、`pnpm dev`、`pnpm typecheck` 都会先执行 prepare。

## 4. 验证器指纹

生成器对 validator 源文件计算 SHA-256，作为 `validatorFingerprint`。validator 内容变化会阻止已有学习记录的课程原地同步。不要再使用 `validator.toString()` 作为指纹（包装函数会改变字符串表现）。

## 5. 课程扫描与快照

```bash
pnpm courses:scan
pnpm courses:scan --out   # 写入 .course-scan.json
pnpm courses:snapshot     # 完整快照（文件摘要、章节、插件、validator 指纹）
pnpm courses:snapshot --out .deployments/courses.json
pnpm courses:preflight    # 只读检查结构是否与已有学习记录兼容
```

- `sourceDigest`：课程目录内全部文件的路径 + SHA-256；检测文案/组件/题库/validator 的任何变化。
- `structuralDigest`：章节顺序/必修/完成规则、必需 Block 的 `chapterHash`、finalExam、activityId/validatorId/validator 指纹；用于避开学习记录不兼容的原地更新。
- `pnpm courses:scan` 不访问数据库、不执行构建、不依赖 Git；`/admin/deployments` 的管理员扫描使用同一套逻辑。
- 版本号未变但源码变化 → 有更新并提示；结构变化且已有学习记录 → 版本冲突并阻止部署。
- 部署时 `updater` 把项目复制为固定快照，后续 prepare/validate/build/sync 都基于该快照。

## 6. 构建集成

- `pnpm dev` / `pnpm build` / `pnpm typecheck` 自动 prepare。
- 新增课程只需新增目录与 `course.json`，不修改核心 Registry。
- 删除课程后 prepare 会清除生成注册项；`courses:sync` 不会删除历史 DB 记录（需独立审核）。
- `/admin/deployments` 的「编译并部署」会先执行 `courses:prepare` / `courses:validate`，再构建镜像；失败不会替换运行中的 web 容器。
