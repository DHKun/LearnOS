# 概念动画与互动教学设计

> 目标：让抽象概念先被看见、被操作、被验证，再用文字准确总结。动画不是装饰，播放动画本身不发积分。

## 1. 教学结构

推荐每个核心知识点按以下顺序组织：

1. **提出问题**：用一句具体问题建立目标。
2. **生活类比**：给出准确、有限定条件的类比。
3. **动画解释**：分步骤展示状态变化与因果关系。
4. **自由探索**：允许改变关键参数、切换案例、重播。
5. **即时反馈**：显示结果并解释原因。
6. **知识检查**：不计分的小测，立即反馈。
7. **原理总结**：回到真实技术对象，明确类比边界。

混合内容章节使用可信 MDX 组合：

```mdx
一段简短引入。

<ConceptPlayer conceptId="sql.data-vs-instruction" blockId="sql-origin" />

<MiniCheck
  id="sql-data-check"
  question="SQL 注入的根本问题是什么？"
  options={["特殊字符", "数据被当成语法", "没有日志"]}
  answer={1}
  explanation="问题在结构与数据边界被打破，而不是某个字符。"
/>

<Callout type="tip" title="原理">
参数化查询让结构与值分离。
</Callout>
```

`MiniCheck` 不计分、不改变章节完成状态；正式测验仍由服务端判分。

## 2. 概念 Registry

`lib/education/concepts.ts` 是唯一的 `conceptId` 清单与元数据来源；`components/concepts/registry.tsx` 显式映射到组件，按需加载，禁止根据用户输入拼接模块路径。

新增概念步骤：

1. 在 `CONCEPT_IDS` 与 `CONCEPT_META` 增加稳定 ID。
2. 在 `components/concepts/` 新建 React 组件。
3. 使用 `ConceptFrame` 提供统一标题、类比、场景、步骤说明、控制与映射表。
4. 在 `registry.tsx` 的 `CONCEPTS` 中显式注册。
5. 在 MDX 中用 `<ConceptPlayer conceptId="..." blockId="..." />` 引用。
6. 执行 `pnpm courses:validate`，加载器会拒绝未注册的 `conceptId`。

## 3. ConceptFrame 契约

每个概念至少提供：

- `conceptId` 与稳定 `blockId`
- `title`
- `analogy`：生活类比，必须注明类比不能覆盖的部分
- `steps[]`：每步标题与解释
- `scenes[]`：与步骤一一对应的可视化
- `mapping[]`：类比事物 → 真实对象 → 能解释的部分
- `insight`：回到技术原理的一句话
- 可选 `controls`：切换案例/参数

`ConceptFrame` 自动提供：

- 播放、暂停、重播、上一步、下一步、速度
- 当前步骤说明与进度
- `prefers-reduced-motion` 关闭自动播放，保留单步
- 键盘方向键/空格操作
- 类比边界与静态图解（`details`）
- 状态保存与事件上报
- 响应式布局与深色主题样式

## 4. 状态与事件

- 概念状态通过 block-scoped Learning SDK 保存：`{ conceptId, blockId, conceptStep, conceptCompleted }`。
- 同一章可以放多个概念动画；每个使用独立 `blockId`，状态写入 `{ schemaVersion: 2, blocks: { [blockId]: ... } }`，不会互相覆盖。
- 旧版扁平状态会作为第一个 concept Block 的 legacy 状态读取，首次保存后自动迁移到命名空间结构。
- 关键事件：
  - `concept_viewed`
  - `concept_step_viewed`
  - `concept_play` / `concept_pause` / `concept_restart`
  - `concept_completed`
  - `concept_variant_changed`
  - `checkpoint_answered`
- 不记录每一帧、鼠标移动或无意义滚动。
- 客户端事件仅供学习分析，**不是不可伪造的过关证据**；正式成绩只来自服务端 validator/测验。

## 5. 无障碍与性能

- 控件使用原生按钮/单选/复选框，支持 Tab 与 Enter/Space。
- 当前步骤使用 `aria-live` 文本提示。
- 颜色之外还使用文字/图标表达状态。
- 尊重 `prefers-reduced-motion`，始终提供静态映射表。
- 动画使用 CSS transition / SVG / Canvas；Canvas 必须清理 RAF 与监听器。
- 页面隐藏时暂停自动播放；不在每一帧写服务端。
- 概念组件通过 `next/dynamic` 按需加载，不进入课程目录首包。

## 6. 类比准确性检查

提交概念前逐项确认：

- 类比中的每个对象是否映射到真实对象？
- 类比是否暗示了错误的因果（例如「参数化 = 过滤特殊字符」）？
- 是否说明类比不能覆盖的边界？
- 是否用文字回到真实技术定义？
- 是否避免让动画播放次数影响成绩？

## 7. 测试

- 纯逻辑：在 `tests/unit/activities.test.ts` 或概念专属测试中验证步骤/判定。
- 浏览器：`tests/e2e/concepts.spec.ts` 覆盖播放/暂停/单步/重播/刷新恢复/知识检查。
- 新增概念至少补一条 E2E，确认在真实课程中可见并可操作。
