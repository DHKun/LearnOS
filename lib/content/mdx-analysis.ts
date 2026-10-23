import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type MdxComponentUse = {
  name: string;
  props: Record<string, string>;
  position: number;
};

type MdxNode = {
  type?: string;
  name?: string | null;
  attributes?: {
    type?: string;
    name?: string;
    value?: unknown;
  }[];
  children?: MdxNode[];
};

const ALLOWED_COMPONENTS = new Set([
  "Callout",
  "ConceptPlayer",
  "MiniCheck",
  "SimulationBlock",
  "KnowledgeCheck",
]);

function literal(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function walk(node: MdxNode, output: MdxComponentUse[], counter: { value: number }): void {
  if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
    const name = node.name ?? "";
    if (name && /^[A-Z]/.test(name)) {
      if (!ALLOWED_COMPONENTS.has(name)) {
        throw new Error(`MDX 使用了未注册的组件: ${name}`);
      }
      const props: Record<string, string> = {};
      for (const attribute of node.attributes ?? []) {
        if (attribute.type !== "mdxJsxAttribute" || !attribute.name) continue;
        const value = literal(attribute.value);
        if (value !== null) props[attribute.name] = value;
      }
      counter.value += 1;
      output.push({ name, props, position: counter.value });
    }
  }
  for (const child of node.children ?? []) walk(child, output, counter);
}

/**
 * Parse trusted repository MDX and return JSX component/props in document
 * order. This catches syntax errors and validates component usage without
 * relying on a fragile regex over the source.
 */
export function analyzeMdx(source: string, label = "MDX"): MdxComponentUse[] {
  let tree: MdxNode;
  try {
    tree = unified().use(remarkParse).use(remarkMdx).parse(source) as MdxNode;
  } catch (error) {
    throw new Error(
      `${label} 不是合法 MDX: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const output: MdxComponentUse[] = [];
  walk(tree, output, { value: 0 });
  return output;
}
