/** Server-side validators. Never imported by a client component. */
import {
  HISTORY_QUESTIONS,
  type Graded,
  type HistoryQuestionId,
  type RepoId,
  gradeBranch,
  gradeCommit,
  gradeHistory,
  gradeIncident,
  gradeMerge,
  gradeRemote,
  gradeUndo,
  parseActions,
  replayLab,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Replays the submitted actions on a fresh repository and grades the end state. */
function workbench(input: unknown, repo: RepoId, grade: (result: ReturnType<typeof replayLab>["repo"]) => Graded): Verdict {
  const actions = parseActions(record(input)?.actions);
  if (!actions) return bad("操作记录的格式不正确。");
  if (actions.length === 0) return bad("还没有做任何操作。");
  const result = grade(replayLab(repo, actions).repo);
  return { passed: result.passed, feedback: { message: result.message } };
}

export function validateCommitLab(input: unknown): Verdict {
  return workbench(input, "commit", gradeCommit);
}

export function validateHistoryLab(input: unknown): Verdict {
  const raw = record(record(input)?.answers);
  if (!raw) return bad("提交内容缺少 answers。");
  const answers = Object.fromEntries(HISTORY_QUESTIONS.map((item) => [item.id, typeof raw[item.id] === "string" && (raw[item.id] as string).length <= 40 ? raw[item.id] : ""])) as Record<HistoryQuestionId, string>;
  const graded = gradeHistory(answers);
  return {
    passed: graded.passed,
    feedback: { message: graded.passed ? "四个问题都答对了：答案都在提交的实际改动里，而不在说明里。" : `答对了 ${graded.correct}/${graded.total} 个。${graded.hints.join("")}` },
  };
}

export function validateUndoLab(input: unknown): Verdict {
  return workbench(input, "undo", gradeUndo);
}

export function validateBranchLab(input: unknown): Verdict {
  return workbench(input, "branch", gradeBranch);
}

export function validateMergeLab(input: unknown): Verdict {
  return workbench(input, "merge", gradeMerge);
}

export function validateRemoteLab(input: unknown): Verdict {
  return workbench(input, "remote", gradeRemote);
}

export function validateIncidentLab(input: unknown): Verdict {
  return workbench(input, "incident", gradeIncident);
}
