# 静态审计修复记录

> 对应审计：2026-10-22，`main @ 2eec49b`。
> 本轮针对可验证问题提交代码与测试；未进行真实部署、压测或动态渗透。

## 状态总览

| 编号 | 级别 | 状态 | 本轮处理 |
|---|---|---|---|
| LRN-001 | P1 | 已修复 | SDK `TRACK` 改为显式 `{type, stepId, payload}`；父窗口兼容旧格式；E2E 断言数据库中的 `audit_run.payload` |
| LRN-002 | P1 | 接受风险 / 部署策略 | 仓库为公开演示，题库与验证器随源码公开；正式测评必须使用私有题库/私有验证器部署（见下） |
| LRN-003 | P1 | 部分处理 | 服务端仍只验证最终提交，未伪造“过程证据”；已明确记录残余风险，建议后续引入服务端 challenge/步骤状态 |
| LRN-004 | P2 | 已修复 | `save_submission` 比较 `submission_hash`；`quiz_attempts` 新增 `request_hash` 并比较；不一致返回 `409 IDEMPOTENCY_KEY_REUSED` |
| LRN-005 | P2 | 已修复 | 新增 `student_points_total()` / `student_point_totals()`；积分总数改用 SQL `SUM`，明细单独读取；测试 1005 条流水 |
| LRN-006 | P2 | 已修复 | 新增 `admin_students_page()`，在数据库完成过滤、计数、排序、分页；服务端不再全量拉取 |
| LRN-007 | P2 | 已修复（离页仍为 best-effort） | `save_state` 改为原子 upsert；SDK 串行化并发保存；`pagehide` 携带 `keepalive` |
| LRN-008 | P2 | 已重构消除 | 删除 iframe/Labs 跨域边界；会话 Cookie `httpOnly`；互动组件走显式 Registry + 同源认证 API |
| LRN-009 | P2 | 已修复 | `courses:sync` 计算并冻结题库内容哈希与 validator 源码哈希；已有报名时变更会被拒绝 |
| LRN-010 | 发布前 | 未验证 | 仍需 staging/生产域名、SMTP、TLS、备份与压测证据 |

## 详细说明

### LRN-001 事件 payload

- `packages/learning-sdk/src/index.ts`：`sendEvent()` 现在发送 `{ type, stepId, payload }`，不再把业务字段平铺。
- `components/learning/lab-frame.tsx`：优先读取 `payload.payload`，同时兼容旧版扁平字段。
- `tests/e2e/learning-flow.spec.ts`：完成 SQL 实验后读取 `activity_events`，断言 `audit_run.payload.defences` 包含 `parameterize`。

### LRN-002 公开题库

仓库定位为公开演示项目，`content/courses/**/quiz.server.json` 与 `validators.ts` 会随源码公开。API 与客户端 bundle 不泄露答案，但公开 GitHub 仍可被学生读取。

正式测评部署必须：

1. 使用私有仓库或私有内容卷存放题库/验证器；
2. 不把正式题库构建进公开镜像；
3. 或改用随机题库、参数化题目与服务端 challenge；
4. 管理员应明确区分演示课程与正式测评课程。

### LRN-003 操作过程证据

当前 `save_submission` 只信任服务端 validator 对**最终提交**的判定。学生跳过 UI 直接 POST 正确策略仍可通过。浏览器事件本身可伪造，不能直接作为实操证明。

建议后续实现：

- 服务端按步骤签发一次性 challenge；
- 提交必须附带当前 challenge 与连续步骤状态；
- 服务端校验步骤顺序、时间窗与一次性消费；
- 管理员报表区分 `interaction_observed` 与 `assessment_passed`。

本轮未实现，保留为已知风险。

### LRN-004 幂等键复用

- `activity_submissions.submission_hash` 在重复 ID 时比较，不一致抛 `IDEMPOTENCY_KEY_REUSED`。
- `quiz_attempts` 新增 `request_hash`；服务端对 `{lessonId, answers}` 做 canonical JSON 哈希。
- 旧数据 `request_hash IS NULL` 时首次带哈希的重试会认领该键，之后不一致即拒绝。
- 测试：`tests/integration/functions.test.ts` 覆盖提交/测验的同键异体；E2E 断言 HTTP 409。

### LRN-005 积分聚合

- `student_points_total(uuid)`：单学生精确总数。
- `student_point_totals()`：所有学生总数，用于管理端列表。
- `getPoints()` 的 `total` 来自 RPC；明细仍最多 1000 条用于展示。
- 测试插入 1005 条流水，断言总数 1005、明细 1000。

### LRN-006 管理端分页

- `admin_students_page(q, online, course, page, pageSize)` 在 PostgreSQL 中完成过滤、计数、排序与分页。
- 服务端 `listStudents()` 只调用一次 RPC，查询数从 4 降为 1。
- 返回结构保持 `{ items, total, page, pageSize }`。

### LRN-007 状态并发

- `save_state()`：`expected_version = 0` 使用原子 INSERT；其他版本使用条件 UPDATE，未命中即 `STATE_VERSION_CONFLICT`，不再 read-then-insert。
- SDK 增加 `inflightSave`，同一状态流串行发送；`pagehide` 消息带 `unload: true`，父窗口使用 `keepalive`。
- 集成测试并发两次首次写入，断言一个成功、一个冲突。
- 离页请求无法确认 HTTP 完成，仍属于 best-effort。

### LRN-008 实验域与 Cookie

- 架构重构后已删除独立 Labs origin、iframe 与 postMessage；互动组件在主应用内运行，不再存在跨域消息边界。
- `createServerClient` 与中间件统一设置会话 Cookie：`httpOnly: true`、`sameSite: lax`、`secure` 按 HTTPS 自动开启。
- 互动组件只能来自显式 Registry，并通过同源认证 `/api/learning/**` 读写；服务端继续校验 enrollment/lesson 归属。
- 残余风险转为「同源组件与主应用共享 Cookie/JS 环境」：必须通过代码审核、服务端 validator 和 `httpOnly` 控制，不能把客户端遥测当作过关凭证。

### LRN-009 题库内容冻结

- `courses:sync` 为每个 quiz 写入 `config.quizHash`（canonical JSON SHA-256）。
- 为每个 interactive 写入 `config.validatorHash`（validator 源码 SHA-256）。
- 已有 enrollment 时哈希不一致即拒绝同步，要求新 course slug。

## 本轮验证

```text
pnpm lint          ✅
pnpm typecheck     ✅
pnpm test          ✅ 61 passed (9 files)
pnpm build         ✅
pnpm security:scan ✅ 62 个客户端资源
pnpm test:e2e      ✅ 16 passed
```

未执行：真实 staging 部署、SMTP、TLS、备份恢复、20–50 人并发压测。
