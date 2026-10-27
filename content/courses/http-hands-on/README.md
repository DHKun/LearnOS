# HTTP 实战：看懂并修好每一次请求（`http-hands-on`）

**版本**：`2.0.0` · **格式**：Manifest `schemaVersion: 3` · **取代**：已删除的 `http-fundamentals`（见 `docs/decisions.md` D50）

## 设计思路

旧课 `http-fundamentals` 的主要问题不在文字，而在交互：

- 实验大多是「照着题干点一下」：默认值离答案只差一个字符，综合任务一甚至默认就是答案；
- 模拟器有开关但没有效果（SameSite、HttpOnly、Accept 切换后结果不变），PUT 在模拟器里返回 405，和课文矛盾；
- 概念动画只是依次高亮方框，看不到状态变化；
- 每章换一个比喻，文字以表格和保留性措辞为主。

新课按三条原则重做：

1. **一个世界**：所有实验都在同一个模拟网站 `library.test` 上进行（`simulation/library.ts`）。它有真实的路由、会话表、Cookie 罐、ETag 和权限，前面章节学到的东西在后面章节继续生效。
2. **先给症状，再让学生修**：每个实验都以「工单」开头，给出一个已经坏掉的请求或配置。学生要读响应、改请求，自己找到原因；校验器检查的是**结果**，而不是某个固定答案。
3. **动画展示状态变化**：数据包在节点间移动，服务器数据表、Cookie 罐、缓存条目随步骤变化；有交互控件的动画（重试、认证、HTTPS、内容协商）可以切换条件对比结果。

比喻统一为「图书馆借阅台」。

## 章节

| # | slug | 内容 | 完成条件 |
| --- | --- | --- | --- |
| 01 | `first-request` | 按下回车后：DNS → 连接 → HTTP；一个页面 = 多个请求 | 手动 |
| 02 | `url` | URL 各部分去向；修复 `#page=2` 与错误端口两条链接 | 实验 |
| 03 | `request` | 请求报文逐行拆开；按书名请求详情 404 → 查列表找 ID | 实验 |
| 04 | `response` | 状态码家族、重定向；从五份响应的头部/正文读答案 | 实验 + 检查 |
| 05 | `methods` | 重试与幂等；馆员身份修正书名（PUT 会清空字段，PATCH 正确） | 实验 + 检查 |
| 06 | `headers-body` | Accept / Content-Type；留言请求 406 → 415 → 400 → 201 | 实验 + 检查 |
| 07 | `cookie` | Cookie 罐与会话表；用 Path/Secure/HttpOnly/SameSite 满足五个场景 | 实验 |
| 08 | `auth` | 两道门（401 / 403），可切换凭据与资源 | 检查 |
| 09 | `https` | Wi-Fi 旁观者在 HTTP / HTTPS 下能看到和做到什么 | 检查 |
| 10 | `cache` | 新鲜期与再验证；为三类资源选 Cache-Control，回放两天访问 | 实验 |
| 11 | `debugging` | 模拟 DevTools Network 面板，逐条诊断并找出根因 | 实验 |
| 12 | `practice` | 只给 API 文档：搜索 → 登录 → 借一本可借的书 | 实验 |
| 13 | `final` | 20 道情景题，80 分及格 | 结业测验 |

规模：13 章、10 个概念动画、9 个实验、40 道服务端计分题（结业 20 道）、若干不计分 MiniCheck。积分：13 × 10 + 结业 50 = 180。

## 目录

```text
simulation/http.ts      报文类型、格式化、严格解析（前端与校验器共用）
simulation/library.ts   library.test 服务器（serve）与模拟浏览器（browserSend：URL、Host、Cookie 罐）
simulation/labs.ts      各实验的数据与判分规则
validators.ts           服务端校验器：严格解析输入后调用 labs.ts 的判分规则
activities/kit.tsx      报文高亮、请求编辑器、工作台、Network 列表（HTTP 专用）
activities/labs.tsx     九个实验组件
concepts/http-concepts.tsx  十个概念动画
assessments/*.server.json   服务端题库（答案不下发浏览器）
```

通用的实验外壳（工单、提交与验证结果）和动画基础组件在平台的 `components/education/lab-kit.tsx`、`scene-kit.tsx` 里，其他课程可以直接复用。制作新课的完整流程见 `.claude/skills/learnos-course-authoring/`。

## 判分与安全

- 浏览器里的模拟只给即时反馈；章节是否通过只由 `validators.ts` 在服务端重新计算决定。
- 工作台类实验（05、12）提交的是**请求记录**，服务端在全新的模拟世界里从头重放，检查最终数据，因此「先做错再修好」也算通过，但伪造 `passed` 字段无效。
- 所有输入都有长度和数量上限（`LIMITS`），格式不符直接判为不通过。
- 页面不能自己设置 `Host`、`Cookie`、`Content-Length`，和真实浏览器一致；Cookie 只能通过登录响应的 `Set-Cookie` 获得。

## 测试

```bash
pnpm vitest run tests/unit/http-hands-on.test.ts     # 模拟器与全部校验器
pnpm test:e2e tests/e2e/http-hands-on.spec.ts         # 13 章真实界面闭环，结课并核对 180 积分
```

E2E 可设置 `E2E_SCREENSHOT_DIR=<目录>` 保存每章截图，方便人工检查排版。

## 修改须知

课程有学习记录后，必修结构、Block、校验器源码（`validators.ts` 的哈希）和题库都会冻结。文案、动画和 `simulation/` 中不影响判分的展示细节可以原地改；改动判分规则时注意 `validators.ts` 依赖 `simulation/labs.ts`，指纹只覆盖 `validators.ts` 本身，所以**修改 `labs.ts` 的判分逻辑也应视为结构性变更**，应发布新 slug。
