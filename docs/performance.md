# LearnOS 性能优化记录（30+ 次）

> 目标：降低加载时间、让加载过程有明确反馈、提升点击/切章/实验/测验的交互速度。
> 环境：本地生产模式 `next build && next start`，LAN 访问，Playwright Chromium，3–5 次采样取中位数/最小值。
> 说明：本记录中的「实验 iframe」指标产生于单站点重构之前；重构后的互动组件随主应用加载，不再有 iframe/第二站点。
> 注意：本机同时运行其他项目的测试时负载波动较大，绝对毫秒会整体漂移；因此同时记录**确定性指标**（客户端 bundle KB、数据库往返次数 q、静态资源字节数），并在低负载窗口复核端到端时间。

## 基线（优化前）

| 指标 | 数值 |
|---|---:|
| 登录 → 课程目录 | 313 ms |
| 课程详情加载 | 115 ms |
| 参加课程 → 播放器 | 190 ms |
| 切换章节 | 121 ms |
| 笔记就绪 | 未单独测量（客户端 GET） |
| 互动实验（重构前 iframe） | 251 ms |
| 测验就绪 | 221 ms |
| `/me` 加载 | 90 ms |
| 管理概览 | 111 ms |
| Learn 路由客户端 bundle | 561.4 KB |
| 课程目录 bundle | 351.4 KB |
| 实验 SDK | 8.7 KB（未压缩、`no-store`） |

## 优化记录

| # | 优化 | 提升证据 |
|---:|---|---|
| 1 | 笔记 Markdown 预览按需 `import("markdown-it")` | Learn bundle **561.4 → 460.8 KB**（−100.6 KB） |
| 2 | 服务端下发实验初始状态，移除客户端 `GET /states` | 实验 **251 → 191 ms**，少 1 次 API + 1 次 DB |
| 3 | 测验题目服务端渲染，移除客户端 `GET /quizzes` | 测验 **229 → 123 ms**（−106 ms） |
| 4 | 笔记内容服务端渲染，移除客户端 `GET /notes` | 少 1 次 API；`notesReady` 稳定 3–8 ms |
| 5 | 当前课程查询内联 course | 服务端 q **4 → 3**，8.97 → 7.32 ms |
| 6 | 测验查询内联 course | q **2 → 1**，6.42 → 3.91 ms |
| 7 | 课程目录内联 lessons | q **4 → 3**，9.72 → 8.46 ms |
| 8 | 课程学员内联 profiles + lessons | q **5 → 3** |
| 9 | 管理概览内联 lessons | q **5 → 4** |
| 10 | 管理课程详情内联 lessons | q **3 → 2** |
| 11 | 学生详情内联 lessons，事件查询并行 | q **8 → 7**，11.52 → 9.97 ms |
| 12 | 学生列表内联 lessons | q **6 → 5** |
| 13 | 课程详情内联 lessons | q **4 → 3**，12.40 → 10.64 ms |
| 14 | 管理概览改为单个 SQL RPC | q **4 → 1**，6.40 → 4.16 ms（−35%） |
| 15 | 学生列表内联积分流水 | q **5 → 4** |
| 16 | 当前课程内联 lessons | q **3 → 2**，8.24 → 6.33 ms |
| 17 | iframe 协议校验去掉客户端 zod | Learn bundle **460.5 → 405.1 KB**（−55.4 KB），domInteractive 55 → 48 ms |
| 18 | 中间件跳过 `/api/**` 的重复鉴权 | 每次 API 少一次 Supabase Auth；`/api/me` 约 51 ms |
| 19 | Learning SDK 压缩 | **8.7 KB → 5.3 KB**（minified） |
| 20 | 实验静态资源缓存 | `no-store` → `max-age=300, stale-while-revalidate=60` |
| 21 | 当前课程内联 lesson_progress | q **2 → 1** |
| 22 | 课程详情内联 lesson_progress | q **3 → 2**，14.97 → 10.58 ms |
| 23 | 课程目录内联 lesson_progress | q **3 → 2**，13.18 → 8.69 ms |
| 24 | 学生列表内联 lesson_progress | q **4 → 3** |
| 25 | 课程学员内联 lesson_progress | q **3 → 2** |
| 26 | 学生详情内联积分流水 | q **7 → 5**，11.84 → 10.62 ms |
| 27 | 课程详情预取 `/learn/[courseId]` | 参加→播放器 **193.5 → 178 ms**（同负载窗口；低负载 133 ms） |
| 28 | 章节导航 `prefetch` | 实验 **219 → 115 ms**；测验 **139 → 65.5 ms**；切章 135 → 122.5 ms |
| 29 | 章节/课程 RSC 预取 + 生产 RSC 复用（默认 staleTimes） | 返回导航 193 → 183 ms；未引入 30s 陈旧窗口 |
| 30 | 全局导航进度条 + 链接 pending 指示 | 点击后**首帧**出现反馈；延迟 RSC 测试中 162 ms 时进度条仍可见 |
| 31 | 「标记本章完成」乐观更新 | 点击立即变为「本章已完成」；失败回滚；并修复跨章节状态串用 |
| 32 | 实验静态资源 gzip + ETag/缓存 | SDK gzip 后 **2.2 KB**；HTML/CSS/JS 压缩传输 |
| 33 | MDX 编译结果按源码缓存 | 同一文章只编译一次，后续请求复用 React 元素 |
| 34 | Supabase admin client 单例 | 复用连接池，避免每次请求 new client |
| 35 | 限制 pending 指示范围到章节导航 | 课程目录 bundle **376.7 → 351.5 KB**（撤销全站 Link 客户端边界） |

## 优化后（低负载窗口，iter28–30）

| 指标 | 基线 | 最终（final2） | 变化 |
|---|---:|---:|---:|
| 登录 → 课程目录 | 313 ms | 316 ms | 基本持平（认证往返） |
| 课程详情 | 115 ms | 74 ms | −41 ms（−36%） |
| 参加课程 → 播放器 | 190 ms | 131 ms | −59 ms（−31%） |
| 切换章节 | 121 ms | 130 ms | 基本持平（±10 ms 噪声；预取已生效） |
| 互动实验（重构前 iframe） | 251 ms | 113 ms | **−138 ms（−55%）** |
| 测验 | 221 ms | 69 ms | **−152 ms（−69%）** |
| 笔记就绪 / 输入 | 客户端 GET / 11 ms | 3 ms / 10 ms | 少一次请求 |
| 管理概览 | 111 ms | 100 ms | −11 ms |
| Learn bundle | 561.4 KB | 405.6 KB | **−155.8 KB（−27.8%）** |
| 课程目录 bundle | 351.4 KB | 351.5 KB | 持平 |
| 实验 SDK | 8.7 KB | 5.3 KB（gzip 2.2 KB） | **−39%** |

> 最终数据来自 `final2`：生产模式、主机负载约 2.4、3 个样本的中位数。其他低负载窗口（iter28–30）数值相近。

## 被否决的实验（未计入 30 次）

- **动态拆分 LabFrame/QuizPlayer**：初始 bundle 减少 63 KB，但首次实验加载 +622 ms、测验 +589 ms；即使 idle 预取仍回退，已撤销。
- **课程内容/loader 内存缓存**：文件仅数 KB，解析成本 <0.2 ms，实测无收益且引入同步后缓存失效问题，已撤销。
- **全站 LinkPending**：课程目录客户端 bundle +25 KB，已限制到章节导航。

## 可复现命令

```bash
pnpm build && pnpm start          # 生产模式（性能结论均基于此）
node scripts/perf-bench.mjs --label=final --samples=5
npx tsx scripts/perf-server.ts --label=server-final --iterations=20
```

原始结果写入 gitignored 的 `.perf/*.json`；查询往返数（q）由 `scripts/perf-server.ts` 包装 `fetch` 统计。
