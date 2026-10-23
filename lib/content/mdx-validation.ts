import type { ChapterBlock } from "@/lib/content/manifest";
import { analyzeMdx } from "@/lib/content/mdx-analysis";

/**
 * Validate JSX references in a trusted chapter MDX file against the manifest
 * and the generated concept/activity registries. Shared by runtime validation,
 * `courses:validate` and deployment snapshots.
 */
export function validateChapterMdx({
  source,
  label,
  blocks,
  isConcept,
  activityExists,
}: {
  source: string;
  label: string;
  blocks: ChapterBlock[];
  isConcept: (conceptId: string) => boolean;
  activityExists: (activityId: string) => boolean;
}): void {
  const uses = analyzeMdx(source, label);
  const declared = new Map(blocks.map((block) => [block.id, block]));
  const seen = new Set<string>();

  for (const use of uses) {
    if (use.name === "ConceptPlayer") {
      const conceptId = use.props.conceptId;
      if (!conceptId) {
        throw new Error(`${label} 的 ConceptPlayer 缺少 conceptId`);
      }
      if (!isConcept(conceptId)) {
        throw new Error(`${label} 引用了未注册的概念动画: ${conceptId}`);
      }
      continue;
    }

    if (use.name === "SimulationBlock" || use.name === "KnowledgeCheck") {
      const blockId = use.props.blockId;
      if (!blockId) {
        throw new Error(`${label} 的 ${use.name} 缺少 blockId`);
      }
      if (seen.has(blockId)) {
        throw new Error(`${label} 重复渲染 Block: ${blockId}`);
      }
      const block = declared.get(blockId);
      if (!block) {
        throw new Error(`${label} 使用了未声明的 Block: ${blockId}`);
      }
      if (use.name === "SimulationBlock" && block.kind !== "simulation") {
        throw new Error(`Block ${blockId} 不是 simulation，不能使用 SimulationBlock`);
      }
      if (use.name === "KnowledgeCheck" && block.kind !== "question") {
        throw new Error(`Block ${blockId} 不是 question，不能使用 KnowledgeCheck`);
      }
      if (use.name === "SimulationBlock" && block.kind === "simulation") {
        if (use.props.activityId !== undefined && use.props.activityId !== block.activityId) {
          throw new Error(
            `Block ${blockId} 的 activityId 与 manifest 不一致: ${use.props.activityId} != ${block.activityId}`,
          );
        }
        if (!activityExists(block.activityId)) {
          throw new Error(`Block ${blockId} 引用了未注册的 activityId: ${block.activityId}`);
        }
      }
      seen.add(blockId);
    }
  }

  for (const block of blocks) {
    if (!seen.has(block.id)) {
      throw new Error(`${label} 声明了 Block ${block.id}，但 MDX 中没有渲染`);
    }
  }
}
