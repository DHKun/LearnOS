import { CheckCircle2, Circle, ListChecks, ShieldCheck } from "lucide-react";

import { CompleteLessonButton } from "@/components/learning/actions";
import { Badge } from "@/components/ui/badge";
import type {
  BlockResultSummary,
  ChapterBlockSummary,
  ChapterCompletionSummary,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChapterProgress({
  lessonId,
  enrollmentId,
  completion,
  blocks,
  blockResults,
  completed,
  readOnly,
}: {
  lessonId: string;
  enrollmentId: string;
  completion: ChapterCompletionSummary;
  blocks: ChapterBlockSummary[];
  blockResults: Record<string, BlockResultSummary>;
  completed: boolean;
  readOnly: boolean;
}) {
  const required = completion.requiredBlocks
    .map((id) => blocks.find((block) => block.id === id))
    .filter((block): block is ChapterBlockSummary => Boolean(block));

  return (
    <section className="mt-6 space-y-4 border-t border-border pt-5" aria-label="本章完成条件">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="size-3" /> 章节完成
        </Badge>
        {completion.mode === "manual" ? (
          <span className="text-xs text-muted-foreground">手动完成</span>
        ) : (
          <span className="text-xs text-muted-foreground">
            {completion.mode === "all" ? "全部必需内容通过" : "任意一项必需内容通过"}
          </span>
        )}
        {completed && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> 已完成
          </Badge>
        )}
      </div>

      {required.length > 0 && (
        <ul className="space-y-2">
          {required.map((block) => {
            const passed = blockResults[block.id]?.passed === true;
            return (
              <li
                key={block.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm",
                  passed && "border-success/40 bg-success/5",
                )}
                data-block-result={block.id}
                data-passed={passed ? "true" : "false"}
              >
                <span className="flex items-center gap-2">
                  {passed ? (
                    <CheckCircle2 className="size-4 text-success" />
                  ) : (
                    <Circle className="size-4 text-muted-foreground/50" />
                  )}
                  <span>{block.title ?? block.id}</span>
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {block.kind === "simulation" ? "模拟实验" : "知识检查"}
                  </span>
                </span>
                <span className={passed ? "text-xs text-success" : "text-xs text-muted-foreground"}>
                  {passed ? "已通过" : "未通过"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {completion.mode === "manual" && blocks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          本章还包含 {blocks.length} 个可选互动内容，不参与正式完成判定。
        </p>
      )}

      {completion.mode !== "manual" && !completed && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ListChecks className="size-3.5" />
          完成条件由服务端根据已验证的 Block 结果计算，满足后自动完成本章并发放首次完成积分。
        </p>
      )}

      {completion.mode === "manual" && (
        <div className="flex flex-col gap-2">
          {readOnly ? (
            <p className="text-sm text-muted-foreground">复习模式不记录新的完成状态。</p>
          ) : completed ? (
            <p className="text-sm text-success">本章已完成，可继续下一节。</p>
          ) : (
            <CompleteLessonButton
              key={lessonId}
              lessonId={lessonId}
              enrollmentId={enrollmentId}
              completed={completed}
            />
          )}
        </div>
      )}
    </section>
  );
}
