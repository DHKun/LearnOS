"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLearning } from "@/lib/learning/context";
import { cn } from "@/lib/utils";

export function MiniCheck({
  id,
  question,
  options,
  answer,
  explanation,
}: {
  id: string;
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}) {
  const { sdk, readOnly } = useLearning();
  const [selected, setSelected] = React.useState<number | null>(null);
  const [submitted, setSubmitted] = React.useState(false);
  const correct = selected === answer;

  function submit() {
    if (selected === null || submitted) return;
    setSubmitted(true);
    if (!readOnly) {
      sdk.track(
        "checkpoint_answered",
        { checkpointId: id, selected, correct, answer },
        `${id}:check`,
      );
    }
  }

  return (
    <section className="my-6 rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="知识检查">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          知识检查 · 不计分
        </span>
      </div>
      <p className="mt-3 text-sm font-medium">{question}</p>
      <div className="mt-3 grid gap-2" role="radiogroup" aria-label={question}>
        {options.map((option, index) => {
          const isSelected = selected === index;
          const showState = submitted && isSelected;
          return (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-sm transition-colors",
                isSelected && "border-primary/50 bg-primary/5",
                showState && (correct ? "border-success/50 bg-success/5" : "border-destructive/40 bg-destructive/5"),
              )}
            >
              <input
                type="radio"
                name={`mini-check-${id}`}
                className="mt-1 size-4 accent-[var(--primary)]"
                checked={isSelected}
                disabled={submitted}
                onChange={() => setSelected(index)}
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={selected === null || submitted}>
          检查答案
        </Button>
        {submitted && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSubmitted(false);
              setSelected(null);
            }}
          >
            再试一次
          </Button>
        )}
      </div>
      {submitted && (
        <div
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm",
            correct
              ? "border-success/40 bg-success/10 text-success"
              : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
          role="status"
        >
          <p className="flex items-center gap-2 font-medium">
            {correct ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {correct ? "判断正确" : "再想一步"}
          </p>
          <p className="mt-1 text-foreground/90">{explanation}</p>
        </div>
      )}
    </section>
  );
}
