import type { QuizQuestion } from "@/lib/content/manifest";
import type { PublicQuizQuestion } from "@/lib/types";

export type QuizAnswerMap = Record<string, string | string[]>;

export function publicQuizQuestion(question: QuizQuestion): PublicQuizQuestion {
  if (question.type === "boolean") {
    return {
      id: question.id,
      prompt: question.prompt,
      type: "single",
      options: [
        { id: "true", label: "正确" },
        { id: "false", label: "错误" },
      ],
    };
  }
  return {
    id: question.id,
    prompt: question.prompt,
    type: question.type,
    options: question.options.map((option) => ({ id: option.id, label: option.label })),
  };
}

function isCorrect(question: QuizQuestion, given: string | string[] | undefined): boolean {
  if (question.type === "boolean") {
    const expected = question.answer ? "true" : "false";
    return given === expected;
  }
  if (question.type === "multiple") {
    const givenList = Array.isArray(given) ? given : [];
    const expected = new Set(question.answer);
    return (
      givenList.length === expected.size && givenList.every((item) => expected.has(item))
    );
  }
  return given === question.answer;
}

export type QuizQuestionResult = {
  questionId: string;
  correct: boolean;
  /** Recorded only for wrong answers, limited to option ids the question defines. */
  given?: string | string[];
};

function knownChoice(
  question: QuizQuestion,
  given: string | string[] | undefined,
): string | string[] | undefined {
  const known =
    question.type === "boolean"
      ? new Set(["true", "false"])
      : new Set(question.options.map((option) => option.id));
  if (question.type === "multiple") {
    if (!Array.isArray(given)) return undefined;
    const picked = [...new Set(given.filter((item) => known.has(item)))].sort();
    return picked.length > 0 ? picked : undefined;
  }
  return typeof given === "string" && known.has(given) ? given : undefined;
}

export function gradeQuiz(
  questions: QuizQuestion[],
  answers: QuizAnswerMap,
): { correct: number; score: number; results: QuizQuestionResult[] } {
  const results = questions.map((question): QuizQuestionResult => {
    const correct = isCorrect(question, answers[question.id]);
    if (correct) return { questionId: question.id, correct };
    const given = knownChoice(question, answers[question.id]);
    return given === undefined
      ? { questionId: question.id, correct }
      : { questionId: question.id, correct, given };
  });
  const correct = results.filter((result) => result.correct).length;
  const score =
    questions.length === 0 ? 0 : Math.round((correct / questions.length) * 10000) / 100;
  return { correct, score, results };
}
