import { describe, expect, it } from "vitest";

import { analyzeMdx } from "@/lib/content/mdx-analysis";
import { validateChapterMdx } from "@/lib/content/mdx-validation";
import type { ChapterBlock } from "@/lib/content/manifest";

const blocks: ChapterBlock[] = [
  { id: "request-lab", kind: "simulation", activityId: "course/request" },
  { id: "request-check", kind: "question", source: "assessments/q.json" },
];

function validate(source: string) {
  return validateChapterMdx({
    source,
    label: "测试章节",
    blocks,
    isConcept: (id) => id === "course/flow",
    activityExists: (id) => id === "course/request",
  });
}

describe("MDX AST 分析", () => {
  it("按文档顺序提取组件与字符串 props", () => {
    const uses = analyzeMdx(
      `<Callout type="tip">说明</Callout>\n\n<ConceptPlayer conceptId="course/flow" blockId="flow-1" />\n\n<SimulationBlock blockId="request-lab" />`,
    );
    expect(uses.map((use) => use.name)).toEqual(["Callout", "ConceptPlayer", "SimulationBlock"]);
    expect(uses[1].props).toEqual({ conceptId: "course/flow", blockId: "flow-1" });
  });

  it("拒绝未注册的大写组件", () => {
    expect(() => analyzeMdx("<UnknownThing />")).toThrow(/未注册的组件/);
  });

  it("拒绝非法 MDX 语法", () => {
    expect(() => analyzeMdx("<ConceptPlayer conceptId='x'")).toThrow(/不是合法 MDX/);
  });

  it("接受声明的全部 Block，并校验概念/活动", () => {
    expect(() =>
      validate(
        `<ConceptPlayer conceptId="course/flow" blockId="flow" />
<SimulationBlock blockId="request-lab" activityId="course/request" />
<KnowledgeCheck blockId="request-check" />`,
      ),
    ).not.toThrow();
  });

  it("声明的 Block 未在 MDX 中渲染时拒绝", () => {
    expect(() => validate(`<SimulationBlock blockId="request-lab" />`)).toThrow(
      /request-check.*没有渲染/,
    );
  });

  it("重复渲染同一个 Block 时拒绝", () => {
    expect(() =>
      validate(`
<SimulationBlock blockId="request-lab" />
<SimulationBlock blockId="request-lab" />
<KnowledgeCheck blockId="request-check" />`),
    ).toThrow(/重复渲染/);
  });

  it("Block 类型与组件不匹配时拒绝", () => {
    expect(() =>
      validate(`
<KnowledgeCheck blockId="request-lab" />
<KnowledgeCheck blockId="request-check" />`),
    ).toThrow(/不是 question/);
  });

  it("未注册的概念或活动时拒绝", () => {
    expect(() =>
      validate(`
<ConceptPlayer conceptId="missing" blockId="flow" />
<SimulationBlock blockId="request-lab" />
<KnowledgeCheck blockId="request-check" />`),
    ).toThrow(/未注册的概念/);
    expect(() =>
      validate(`
<SimulationBlock blockId="request-lab" activityId="course/other" />
<KnowledgeCheck blockId="request-check" />`),
    ).toThrow(/activityId 与 manifest 不一致/);
  });
});
