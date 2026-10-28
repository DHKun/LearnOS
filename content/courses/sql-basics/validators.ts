/** Server-side validators. Never imported by a client component. */
import { CONSOLE_GRADERS, type ConsoleLabId, type QueryLabId, gradeQueryLab, parseSql, parseStatements, replayConsole } from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Runs the submitted query on a fresh copy of the data and checks the result. */
function queryLab(input: unknown, id: QueryLabId): Verdict {
  const sql = parseSql(record(input)?.sql);
  if (!sql) return bad("没有收到查询语句。");
  const graded = gradeQueryLab(id, sql);
  return { passed: graded.passed, feedback: { message: graded.message } };
}

/** Replays the submitted statements on a fresh database and grades the committed data. */
function consoleLab(input: unknown, id: ConsoleLabId): Verdict {
  const statements = parseStatements(record(input)?.statements);
  if (!statements) return bad("语句记录的格式不正确。");
  if (statements.length === 0) return bad("还没有运行过任何语句。");
  const graded = CONSOLE_GRADERS[id](replayConsole(id, statements).session);
  return { passed: graded.passed, feedback: { message: graded.message } };
}

export const validateOverdueLab = (input: unknown) => queryLab(input, "overdue");
export const validateLatestLab = (input: unknown) => queryLab(input, "latest");
export const validateLimitLab = (input: unknown) => queryLab(input, "overLimit");
export const validateReportLab = (input: unknown) => queryLab(input, "report");
export const validateModifyLab = (input: unknown) => consoleLab(input, "modify");
export const validateTransactionLab = (input: unknown) => consoleLab(input, "transaction");
export const validateIncidentLab = (input: unknown) => consoleLab(input, "incident");
