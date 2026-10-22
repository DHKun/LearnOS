import { describe, expect, it } from "vitest";

import { extractHeadings } from "@/lib/content/headings";

describe("extractHeadings", () => {
  it("提取 h2/h3 并生成稳定的 id", () => {
    const headings = extractHeadings(`
## 注入从哪里来

正文。

### 信任边界

## 转义为什么不够
`);
    expect(headings).toEqual([
      { id: "注入从哪里来", text: "注入从哪里来", depth: 2 },
      { id: "信任边界", text: "信任边界", depth: 3 },
      { id: "转义为什么不够", text: "转义为什么不够", depth: 2 },
    ]);
  });

  it("忽略代码块内的 # 注释", () => {
    const headings = extractHeadings(`
## 真正的标题

\`\`\`ts
## 这不是标题
const x = 1;
\`\`\`

### 另一个标题
`);
    expect(headings.map((item) => item.text)).toEqual(["真正的标题", "另一个标题"]);
  });

  it("为重复标题生成递增后缀", () => {
    const headings = extractHeadings(`
## 示例
## 示例
`);
    expect(headings.map((item) => item.id)).toEqual(["示例", "示例-1"]);
  });

  it("清理行内代码与链接标记", () => {
    const headings = extractHeadings(`
## 使用 \`WHERE\` 条件

### [参数化查询](https://example.com)
`);
    expect(headings).toEqual([
      { id: "使用-where-条件", text: "使用 WHERE 条件", depth: 2 },
      { id: "参数化查询", text: "参数化查询", depth: 3 },
    ]);
  });
});
