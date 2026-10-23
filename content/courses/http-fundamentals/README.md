# HTTP 从零到会用（LearnOS 可安装课程）

**课程 ID / slug**：`http-fundamentals`  
**课程版本**：`1.0.0`  
**格式**：LearnOS Manifest `schemaVersion: 3`（统一章节模型）  
**基线代码**：FloatCTF/LearnOS `929571f7e525f893c454c21f05febf89f81d6cb3`（2026-10-23）

## 课程内容

该课程是当前仓库唯一安装的课程；旧课程已移除，学习记录随旧课程清理。

| 章 | 标题 | 内容块 | 完成条件 |
| --- | --- | --- | --- |
| 01 | 互联网中的浏览器与服务器 | 图文、SVG/JS 分步动画 | 手动 |
| 02 | URL：找到正确的资源 | 图文、URL 结构可视化 | 手动 |
| 03 | 从地址栏到网页 | 图文、网络通信动画 | 手动 |
| 04 | 请求报文 | 图文、报文动画、JS 请求工作台 | 实验通过 |
| 05 | 响应与状态码 | 图文、状态码动画、正式检查 | 正式检查通过 |
| 06 | HTTP 方法 | 图文、方法匹配实验、正式检查 | 两项通过 |
| 07 | Header | 图文、正式检查 | 正式检查通过 |
| 08 | Body / JSON | 图文、JS 创建便签模拟 | 实验通过 |
| 09 | Cookie / Session | 图文、会话动画、Cookie 模拟 | 实验通过 |
| 10 | 认证与授权 | 图文、401/403 正式检查 | 正式检查通过 |
| 11 | HTTPS / TLS | 图文、TLS 动画 | 手动 |
| 12 | 缓存与条件请求 | 图文、缓存动画、ETag 实验 | 实验通过 |
| 13 | 排查 HTTP 问题 | 图文、故障诊断 JS 实验 | 实验通过 |
| 14 | 综合实战 | 三任务 HTTP 模拟 | 全部任务通过 |
| 15 | 课程总结与结业 | 图文、20 题正式综合测验 | 80 分及以上 |

资源规模：**15 章、7 组可复用概念动画、7 个 JS 模拟实验、36 道服务端计分试题（含 20 道结业题）**。

## 安装到 LearnOS

压缩包内顶层目录就是 `http-fundamentals/`，解压到 LearnOS 项目的 `content/courses/` 即可：

```bash
cd /path/to/LearnOS
unzip HTTP-LearnOS-2026.zip -d content/courses/

pnpm courses:validate
pnpm typecheck
pnpm build
```

然后通过现有 `/admin/deployments` 扫描并部署新课程，或者在完整开发环境里执行：

```bash
pnpm courses:sync           # 新课程默认 draft
# 在 /admin/courses 中审核并发布课程
```

**当前 LearnOS 的课程 React 插件仍在 Next.js 构建期注册。** 因此仅复制目录不会让正在运行的 Web 容器立即加载新组件；必须使用现有课程部署流程。无需改 LearnOS 源码或手工编辑生成的 Registry。

## 课程业务规则

- 所有动画、图文、JS 实验、答题都是按教学需要出现的，不是每章强制具备。
- 仅被 `completion.requiredBlocks` 引用的正式实验/答题会阻止章节通过。
- 没有必需 Block 的纯图文 / 纯动画章节允许手动完成。
- 必需 Block 通过后由服务端自动完成章节，无需额外点击“本章完成”。
- 动画播放、浏览页面、前端模拟成功都**不直接授予积分**。
- 客户端 JS 模拟不会发送网络请求；正式通过通过服务端 `validators.ts` 重算并进入 LearnOS 的事务记录。
- 正式知识检查答案保存在 `assessments/*.server.json`，不能由客户端直接读取。
- 右侧笔记、章节学习状态、进度与积分完全复用主站现有机制。

## 内容目录结构

```text
http-fundamentals/
├── course.json
├── README.md
├── lessons/                # 15 章 MDX，负责图文、动画、实验和题目的顺序
├── concepts/http-concepts.tsx
├── activities/http-activities.tsx
├── simulation/http.ts      # 无网络访问的确定性 HTTP 模拟
├── validators.ts           # 服务端可信验证
└── assessments/            # 5 个服务端题库 JSON
```

## 准确性参考

- [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 9111 — HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [MDN — Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
- [MDN — Overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)

教学模拟仅覆盖本课程显式列出的少量虚拟路由、固定用户和 Cookie 情境，并非完整 HTTP 服务器或浏览器 Cookie 引擎，不适合用作生产网络栈。

## 发布与后续修改

- 第一次加入新课程：保持 `slug=http-fundamentals`、`version=1.0.0`。
- 以后修改文字、视觉资源后，递增 `version` 并使用后台扫描/部署。
- 当课程已经存在学员记录时，不能随意修改章节 ID、顺序、必需 Block 或题库/validator 判定语义；LearnOS 会依课程冻结策略拒绝不兼容的同步。结构性大改使用新的 course slug。

## 本地校验记录

本包作者侧使用 Node.js / TypeScript 语法检查、完整 JSON/Manifest/MDX 交叉引用检查、模拟器与验证器功能测试，以及独立 TS 类型检查（对 LearnOS API 使用匹配接口声明）执行过校验。**由于当前环境无法获取完整 LearnOS 源码与 node_modules，没有在目标仓库实际运行 `pnpm courses:validate`、`pnpm build` 或集成 E2E。** 解压后请按上述命令完成正式验收。
