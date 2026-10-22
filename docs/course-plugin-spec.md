# Course Plugin Spec (Manifest v2)

## 1. 目录约定

```text
content/courses/<slug>/
  course.json
  lessons/*.mdx
  concepts/*.tsx
  activities/*.tsx
  simulation/*.ts
  validators.ts
  quiz.server.json
  assets/*
```

所有路径必须位于该课程目录内；生成器拒绝 `..`、绝对路径和跨课程引用。组件只能使用项目已审核的 npm 依赖与公共 UI/学习 SDK。

## 2. Manifest v2

```json
{
  "schemaVersion": 2,
  "slug": "sql-injection-basics",
  "title": "SQL 注入",
  "description": "...",
  "version": "1.0.0",
  "plugins": {
    "concepts": [
      {
        "id": "data-vs-instruction",
        "legacyGlobalId": "sql.data-vs-instruction",
        "component": "concepts/sql-data-vs-instruction.tsx",
        "export": "SqlDataVsInstruction",
        "title": "数据与指令",
        "analogy": "餐厅点餐"
      }
    ],
    "activities": [
      {
        "id": "sql-injection-lab",
        "legacyGlobalId": "sql-injection-lab",
        "component": "activities/sql-injection.tsx",
        "export": "SqlInjectionActivity",
        "title": "SQL 注入审计台",
        "validator": {
          "id": "sql-injection-lab",
          "path": "validators.ts",
          "export": "validateSqlInjectionLab"
        }
      }
    ]
  },
  "lessons": []
}
```

- 新插件默认全局 ID 为 `${courseSlug}/${localId}`。
- `legacyGlobalId` 只用于已上线课程迁移，保存原有 activity/concept ID 与学习记录。
- `id` 在单个插件内唯一；全局 ID 在所有课程间唯一。
- `component`/`validator.path` 必须是课程目录内的相对路径；`export` 必须真实存在。
- 不允许 URL、远程 JS、任意命令、用户上传代码。

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

生成器对 validator 源文件计算 SHA-256，作为 `validatorFingerprint`。旧课程首次同步会写入版本 2 指纹；此后 validator 内容变化会阻止已有学习记录的课程原地同步。不要再使用 `validator.toString()` 作为指纹（包装函数会改变字符串表现）。

## 5. 课程扫描

```bash
pnpm courses:scan
pnpm courses:scan --out   # 写入 .course-scan.json
```

输出每门课程的 slug、title、courseVersion、sourceDigest、文件数，用于部署候选比较；不访问数据库、不执行构建。

## 6. 构建集成

- `pnpm dev` / `pnpm build` / `pnpm typecheck` 自动 prepare。
- 新增课程只需新增目录与 `course.json`，不修改核心 Registry。
- 删除课程后 prepare 会清除生成注册项；`courses:sync` 不会删除历史 DB 记录（需独立审核）。
