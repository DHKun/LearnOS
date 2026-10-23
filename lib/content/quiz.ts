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

export function gradeQuiz(
  questions: QuizQuestion[],
  answers: QuizAnswerMap,
): { correct: number; score: number; results: { questionId: string; correct: boolean }[] } {
  const results = questions.map((question) => ({
    questionId: question.id,
    correct: isCorrect(question, answers[question.id]),
  }));
  const correct = results.filter((result) => result.correct).length;
  const score =
    questions.length === 0 ? 0 : Math.round((correct / questions.length) * 10000) / 100;
  return { correct, score, results };
}
