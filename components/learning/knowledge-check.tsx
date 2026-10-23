"use client";

import * as React from "react";
import { CheckCircle2, ListChecks, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BlockScope, useChapterLearning } from "@/lib/learning/chapter-context";
import { useLearning } from "@/lib/learning/context";
import { useBlockState } from "@/lib/learning/hooks";
import type { LearningState } from "@/lib/learning/types";
import type { PublicChapterBlock } from "@/lib/content/blocks";
import { cn } from "@/lib/utils";

type AnswerValue = string | string[];
type Answers = Record<string, AnswerValue>;

type CheckState = {
  answers: Answers;
} & LearningState;

const INITIAL: CheckState = { answers: {} };

function normalize(value: unknown): CheckState {
  const raw = (value ?? {}) as Record<string, unknown>;
  const answers = raw.answers;
  return {
    answers:
      answers && typeof answers === "object" && !Array.isArray(answers)
        ? (answers as Answers)
        : {},
  };
}

export function KnowledgeCheck({ blockId }: { blockId: string }) {
  const chapter = useChapterLearning();
  const block = chapter.blocks.find((item) => item.id === blockId);
  if (!block || block.kind !== "question") {
    return (
      <div className="my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        未声明的章节知识检查：{blockId}
      </div>
    );
  }
  return (
    <BlockScope blockId={blockId} kind="question">
      <KnowledgeCheckInner block={block} />
    </BlockScope>
  );
}

type PublicQuestion = NonNullable<PublicChapterBlock["questions"]>[number];

const QuestionCard = React.memo(function QuestionCard({
  question,
  index,
  namePrefix,
  selected,
  disabled,
  onSelect,
}: {
  question: PublicQuestion;
  index: number;
  namePrefix: string;
  selected: AnswerValue | undefined;
  disabled: boolean;
  onSelect: (questionId: string, optionId: string, multiple: boolean) => void;
}) {
  const multiple = question.type === "multiple";
  return (
    <div
      data-question-id={question.id}
      className="rounded-lg border border-border p-3"
    >
      <p className="text-sm font-medium">
        <span className="mr-2 font-mono text-xs text-muted-foreground">
          {String(index + 1).padStart(2, "0")}
        </span>
        {question.prompt}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{multiple ? "多选" : "单选"}</p>
      <div className="mt-2 grid gap-2">
        {question.options.map((option) => {
          const checked = multiple
            ? Array.isArray(selected) && selected.includes(option.id)
            : selected === option.id;
          return (
            <label
              key={option.id}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border border-border px-3 py-2 text-sm",
                checked && "border-primary/50 bg-primary/5",
                disabled && "cursor-default opacity-80",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={`${namePrefix}-${question.id}`}
                value={option.id}
                checked={checked}
                disabled={disabled}
                onChange={() => onSelect(question.id, option.id, multiple)}
                className="mt-0.5 size-4 accent-[var(--primary)]"
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
});

function KnowledgeCheckInner({ block }: { block: PublicChapterBlock }) {
  const chapter = useChapterLearning();
  const { sdk, readOnly } = useLearning();
  const { state, setState } = useBlockState<CheckState>(INITIAL, normalize);
  const [pending, setPending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);
  const [feedback, setFeedback] = React.useState<Record<string, unknown> | null>(
    chapter.blockResults[block.id]?.feedback ?? null,
  );
  const passed = chapter.blockResults[block.id]?.passed === true;
  const questions = block.questions ?? [];

  const select = React.useCallback(
    (questionId: string, optionId: string, multiple: boolean) => {
      if (readOnly) return;
      setState((current) => {
        const existing = current.answers[questionId];
        const next = multiple
          ? Array.isArray(existing)
            ? existing.includes(optionId)
              ? existing.filter((id) => id !== optionId)
              : [...existing, optionId]
            : [optionId]
          : optionId;
        return { ...current, answers: { ...current.answers, [questionId]: next } };
      });
    },
    [readOnly, setState],
  );

  async function submit() {
    if (pending || readOnly || passed) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await sdk.submit({ answers: state.answers });
      setFeedback(result.feedback ?? null);
      setSuccess(result.passed);
      setMessage(result.passed ? "本章知识检查已通过" : "未达到通过线，可以修改后重试");
      sdk.track("knowledge_check_submitted", { blockId: block.id, passed: result.passed });
    } catch (caught) {
      setSuccess(false);
      setMessage(caught instanceof Error ? caught.message : "提交失败");
    } finally {
      setPending(false);
    }
  }

  const answered = Object.keys(state.answers).length;

  return (
    <section
      className="my-8 rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"
      data-block-id={block.id}
      data-block-kind="question"
      aria-label={`章节知识检查：${block.title ?? block.id}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <ListChecks className="size-3" /> 章节知识检查
          </Badge>
          <span className="text-sm font-medium">{block.title ?? "知识检查"}</span>
        </div>
        {passed && (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> 已通过
          </Badge>
        )}
      </div>

      <div className="mt-4 space-y-4">
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            namePrefix={block.id}
            selected={state.answers[question.id]}
            disabled={readOnly || passed}
            onSelect={select}
          />
        ))}
      </div>

      {feedback && (
        <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
          {typeof feedback.correctCount === "number" && typeof feedback.questionCount === "number" ? (
            <p>
              答对 {String(feedback.correctCount)} / {String(feedback.questionCount)} 题
              {typeof feedback.score === "number" ? ` · 得分 ${String(feedback.score)}` : ""}
              {typeof feedback.passScore === "number" ? ` · 通过线 ${String(feedback.passScore)}` : ""}
            </p>
          ) : (
            <p>结果已由服务端记录。</p>
          )}
        </div>
      )}

      {message && (
        <p
          className={cn(
            "mt-3 flex items-center gap-2 text-sm",
            success ? "text-success" : "text-destructive",
          )}
          role="status"
        >
          {success ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {message}
        </p>
      )}

      {!passed && !readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void submit()} disabled={pending}>
            {pending ? "正在评分…" : "提交知识检查"}
          </Button>
          <span className="text-xs text-muted-foreground">
            已作答 {answered} / {questions.length}
          </span>
        </div>
      )}
      {readOnly && !passed && (
        <p className="mt-3 text-sm text-muted-foreground">课程已完成，复习模式不记录新的通过状态。</p>
      )}
    </section>
  );
}
