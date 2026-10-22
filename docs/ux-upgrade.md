# LearnOS 教学体验与 UX 升级报告

基线：`main @ 1d89db5`（单站点原生活动重构之后）。

## 1. 需求追踪矩阵

| 编号 | 要求 | 状态 | 主要落点 |
|---|---|---|---|
| UX-01.1 | 管理端可靠刷新 | 已实现 | `lib/client/use-polling.ts`、学生/课程列表、学生详情、课程学员表 |
| UX-01.2 | 笔记可靠保存 | 已实现 | 本地草稿、900ms 自动保存、keepalive、失败重试、多标签冲突提示、登出清理 |
| UX-01.3 | 元数据来源统一 | 已实现 | `lib/content/sync-policy.ts`、`--refresh-metadata`、单测 |
| UX-02 | 学习工作区 | 已实现 | `components/learning/workspace.tsx`：折叠目录、笔记抽屉、专注模式、移动端抽屉 |
| UX-03 | 连续学习与任务引导 | 已实现 | 完成条件提示、`LessonPager`、课程完成入口、完成章节不再显示领取按钮 |
| UX-04 | 实验体验升级 | 已实现 | 目标引导、参数探索、即时反馈、通过后重置/继续探索 |
| UX-05 | 独立学生详情 | 已实现 | `/admin/students/[id]` 四标签页、中文时间线、账号操作 |
| UX-06 | 学习监控 | 已实现 | 概览四类关注列表，一键进入学生详情 |
| UX-07 | 视觉/交互规则 | 已实现（增量） | 统一工作区、卡片、状态、空/加载/错误态、响应式 |
| UX-08 | 全链路验收 | 部分 | 375/768/1440、浅/深色、核心流程 E2E；慢网/断网未模拟 |
| 混合内容 | 文字 + 动画 + 检查 | 已实现 | MDX `ConceptPlayer` + `MiniCheck` + `Callout`；旧 MDX 兼容 |
| 概念动画 | 四个动画 | 已实现 | SQL 数据/指令、SQL 参数化、幂等回执丢失、幂等键去重 |
| 实验迁移 | 两个实验升级 | 已实现 | 原生 SQL/幂等组件；通过后可重置继续探索 |
| 数据兼容 | 历史数据/ID | 已实现 | 迁移仅更新 `lessons.config`；事务演练与带报名同步验证 |

## 2. 信息架构调整

学生端：

- `/courses` 课程入口与目录；顶部仅保留一个当前课程入口。
- `/courses/[slug]` 目标、章节预览、报名/恢复。
- `/learn/[courseId]` 沉浸式工作区：可折叠目录 + 主内容 + 默认关闭的笔记抽屉；移动端内容优先。
- `/me` 学习历史与积分。

管理员端：

- `/admin` 概览 + 四类关注列表。
- `/admin/students` 搜索/筛选/创建/分页；点击进入独立详情。
- `/admin/students/[id]` 概览、章节进度、学习时间线、成绩与积分。
- `/admin/courses` 发布/归档/编辑。
- `/admin/courses/[id]` 结构、学员真实分页、学生互链。

## 3. 课程内容模型

- 保留 `article / interactive / quiz` 与既有课程/章节 ID。
- article 的 MDX 可组合文字、`ConceptPlayer`、`MiniCheck`、`Callout`，顺序由 MDX 控制。
- 可选 `unit` 逻辑分组同步到 `lessons.config.unit`，目录按单元分段；不新增表、不参与结构冻结。
- 概念动画通过 `conceptId` 注册；互动实验通过 `activityId` 注册；正式测验仍由服务端判分。

## 4. 概念动画架构

- `lib/education/concepts.ts`：稳定 ID、标题、类比元数据、事件语义映射。
- `components/concepts/registry.tsx`：显式、按需加载四个概念组件。
- `components/education/concept-frame.tsx`：标题/类比/场景/步骤/控制/静态图解/映射表。
- `components/education/use-concept-playback.ts`：播放、暂停、重播、单步、速度、页面隐藏暂停、reduced-motion。
- 状态：`{ conceptId, blockId, conceptStep, conceptCompleted }` 写入当前 lesson 的 `activity_states`。
- 事件：`concept_viewed`、`concept_step_viewed`、`concept_play/pause/restart`、`concept_completed`、`concept_variant_changed`、`checkpoint_answered`。
- 事件是遥测，不是不可伪造的过关证明；动画/检查不计分。

## 5. 四个动画

1. `sql.data-vs-instruction`：餐厅订单类比，正常/注入订单切换，展示数据越过边界成为指令。
2. `sql.parameter-binding`：固定表格/填空类比，拼接 vs 参数化、正常/注入输入对比。
3. `idempotency.lost-response`：支付回执丢失，响应丢失/超时/正常回执，时间线与扣款次数。
4. `idempotency.deduplication`：快递订单号类比，无键/新键/稳定键 × 去重开关，唯一约束与结果复用。

每个动画都包含类比边界表、静态说明、步骤说明与可操作控制。

## 6. 两个互动实验

- SQL 审计：载荷、防御组合、SQL 预览、审计结果、服务端提交、通过后重置继续探索。
- 幂等支付：键策略、重试策略、去重开关、重试预算、时间线、扣款结果、通过后重置继续探索。
- 通过/积分仍由服务端 validator 与事务函数决定；重置只重置本地模拟状态。

## 7. Learning SDK 与管理员时间线

- 概念动画与互动组件共用 `LearningProvider` / `LearningClient`。
- 事件关联 student/enrollment/lesson/block/step/payload/时间；管理员时间线把技术事件映射为中文说明，原始 JSON 折叠。
- 管理端事件只用于学习分析，不是正式成绩依据。

## 8. 数据库兼容性

- 未新增业务表；`lessons.config` 增加 `unit`，原有 `activityId`/`validatorHash`/`quizHash` 保留。
- 迁移仅更新 `config`，courseId/lessonId/enrollment/lesson_progress/notes/point_events/quiz_attempts 不变。
- 已有报名的课程再次 `courses:sync` 成功；普通同步不覆盖管理员 title/description。
- 本地库无真实学生历史数据；迁移一致性用过事务演练与带 enrollment 的同步测试验证。

## 9. 验证结果（本次实际执行）

```text
pnpm lint             ✅
pnpm typecheck        ✅
pnpm test             ✅ 10 files / 63 tests
pnpm build            ✅
pnpm test:e2e         ✅ 16 passed
pnpm security:scan    ✅ 62 个客户端资源
pnpm courses:validate ✅ 2/2
```

E2E 覆盖：四个概念动画、播放/暂停/单步/重播、刷新恢复、知识检查、两个实验、原生互动、多标签冲突、笔记抽屉、管理员独立学生详情与互链、确认弹窗、权限/CSRF/积分。

## 10. 截图

- 桌面工作区：`docs/screenshots/workspace-desktop-top.png`
- 平板：`docs/screenshots/workspace-tablet-top.png`
- 手机：`docs/screenshots/workspace-mobile-top.png`
- 手机目录/笔记：`docs/screenshots/workspace-mobile-nav.png`、`workspace-mobile-notes.png`
- 深色：`docs/screenshots/workspace-dark-top.png`
- 概念动画：`docs/screenshots/concept-sql-data.png`
- 管理概览/学生详情：`admin-overview-v2.png`、`admin-student-detail-v2.png`

## 11. 未完成 / 风险

- 未模拟慢速网络、断网、真实设备性能分级；仅做静态/浏览器交互验证。
- 未执行真实 staging、TLS、SMTP、备份恢复与 20–50 人并发压测。
- 概念动画每章建议一个；多动画同章需要扩展状态命名空间。
- 客户端事件可被脚本伪造；正式成绩只信任服务端 validator/测验。
- 公开仓库中的示例题库仍不具保密性；正式测评需私有题库部署。
