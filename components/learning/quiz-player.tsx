"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";

import { ApiClientError, apiFetch } from "@/lib/client/api";
import { createUuid } from "@/lib/uuid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuizPayload, QuizSubmitResult } from "@/lib/types";

type Answers = Record<string, string | string[]>;

export type QuizPlayerProps = {
  lessonId: string;
  enrollmentId: string;
  readOnly: boolean;
  alreadyCompleted: boolean;
  initialQuiz: QuizPayload;
};

export function QuizPlayer({
  lessonId,
  enrollmentId,
  readOnly,
  alreadyCompleted,
  initialQuiz,
}: QuizPlayerProps) {
  const router = useRouter();
  const quiz = initialQuiz;
  const [answers, setAnswers] = React.useState<Answers>({});
  const [result, setResult] = React.useState<QuizSubmitResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function selectSingle(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  function toggleMultiple(questionId: string, optionId: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      const next = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: next };
    });
  }

  async function submit() {
    if (!quiz) return;
    setPending(true);
    setError(null);
    try {
      const data = await apiFetch<QuizSubmitResult>(`/api/quizzes/${lessonId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          attemptId: createUuid(),
          enrollmentId,
          answers,
        }),
      });
      setResult(data);
      if (data.passed) router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "提交失败，请稍后重试");
    } finally {
      setPending(false);
    }
  }

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
        <span>
          共 {quiz.questions.length} 题 · 及格线 <strong>{quiz.passScore}</strong> 分
        </span>
        <span className="text-xs text-muted-foreground">
          答案与评分只在服务端处理，可重复尝试
        </span>
      </div>

      {quiz.questions.map((question, index) => {
        const selected = answers[question.id];
        return (
          <Card key={question.id} data-question-id={question.id}>
            <CardHeader>
              <CardTitle className="text-base leading-relaxed">
                <span className="mr-2 font-mono text-xs text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {question.prompt}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {question.type === "multiple" ? "多选" : "单选"}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {question.options.map((option) => {
                const checked =
                  question.type === "multiple"
                    ? Array.isArray(selected) && selected.includes(option.id)
                    : selected === option.id;
                return (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 text-sm transition-colors hover:bg-muted/60 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/5"
                  >
                    <input
                      type={question.type === "multiple" ? "checkbox" : "radio"}
                      name={question.id}
                      value={option.id}
                      checked={checked}
                      disabled={readOnly}
                      onChange={() =>
                        question.type === "multiple"
                          ? toggleMultiple(question.id, option.id)
                          : selectSingle(question.id, option.id)
                      }
                      className="mt-0.5 size-4 accent-[var(--primary)]"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {result && (
        <div
          className={
            result.passed
              ? "rounded-lg border border-success/40 bg-success/10 p-4"
              : "rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          }
        >
          <p className="flex items-center gap-2 font-medium">
            {result.passed ? (
              <CheckCircle2 className="size-5 text-success" />
            ) : (
              <XCircle className="size-5 text-destructive" />
            )}
            {result.passed ? "测验通过，章节已完成" : "未达到及格线，可以再次尝试"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            得分 {result.score} / 100 · 答对 {result.correctCount} / {result.questionCount} 题 ·
            及格线 {result.passScore}
          </p>
          {result.pointsAwarded > 0 && (
            <p className="mt-1 text-sm text-success">本次获得 {result.pointsAwarded} 积分</p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {readOnly || alreadyCompleted ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          该测验已完成。复习模式不会重复提交或发放积分。
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={submit} disabled={pending || answeredCount === 0}>
            {pending ? "正在评分…" : "提交测验"}
          </Button>
          <span className="text-xs text-muted-foreground">
            已作答 {answeredCount} / {quiz.questions.length}
          </span>
        </div>
      )}
    </div>
  );
}
