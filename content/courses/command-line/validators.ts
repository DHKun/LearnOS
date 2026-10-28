/** Server-side validators. Never imported by a client component. */
import {
  LOG_QUESTIONS,
  type LogQuestionId,
  PATH_SETTINGS,
  PERM_ITEMS,
  type PathKey,
  type PermKey,
  evaluatePaths,
  evaluatePerms,
  gradeDisk,
  gradeEnv,
  gradeFiles,
  gradeLogs,
  gradePipes,
  gradeProcesses,
  parseHistory,
  replayLab,
  type Graded,
  type MachineId,
} from "./simulation/labs";

type Verdict = { passed: boolean; feedback: Record<string, unknown> };
const bad = (message: string): Verdict => ({ passed: false, feedback: { message } });

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function short(value: unknown, max = 80): string | undefined {
  return typeof value === "string" && value.length <= max ? value : undefined;
}

/** Fields keyed by a fixed id list; any missing or oversized field rejects the whole submission. */
function fields<T extends string>(input: unknown, key: string, ids: readonly T[], max: number): Record<T, string> | null {
  const raw = record(record(input)?.[key]);
  if (!raw) return null;
  const out = {} as Record<T, string>;
  for (const id of ids) {
    const value = short(raw[id], max);
    if (value === undefined) return null;
    out[id] = value;
  }
  return out;
}

/** Replays the submitted command history on a fresh machine and grades the end state. */
function terminal(input: unknown, machine: MachineId, grade: (m: ReturnType<typeof replayLab>["machine"]) => Graded): Verdict {
  const history = parseHistory(record(input)?.history);
  if (!history) return bad("命令记录的格式不正确。");
  if (history.length === 0) return bad("还没有运行过任何命令。");
  const result = grade(replayLab(machine, history).machine);
  return { passed: result.passed, feedback: { message: result.message } };
}

export function validatePathsLab(input: unknown): Verdict {
  const values = fields<PathKey>(input, "values", PATH_SETTINGS.map((item) => item.key), 80);
  if (!values) return bad("设置不完整。");
  const result = evaluatePaths(values);
  const wrong = result.rows.filter((row) => !row.ok);
  return {
    passed: result.passed,
    feedback: {
      message: result.passed
        ? "四个路径不管从哪里运行都指对了。脚本里写绝对路径，就不用操心“现在在哪个目录”。"
        : `还有 ${wrong.length} 个设置在某种运行方式下指错了：${wrong.map((row) => row.key).join("、")}。`,
    },
  };
}

export function validateFilesLab(input: unknown): Verdict {
  return terminal(input, "files", gradeFiles);
}

export function validateLogsLab(input: unknown): Verdict {
  const raw = record(record(input)?.answers);
  if (!raw) return bad("提交内容缺少 answers。");
  const answers = Object.fromEntries(LOG_QUESTIONS.map((item) => [item.id, short(raw[item.id], 40) ?? ""])) as Record<LogQuestionId, string>;
  const graded = gradeLogs(answers);
  return {
    passed: graded.passed,
    feedback: {
      message: graded.passed
        ? "四个问题都答对了：时间、地址、次数和原因都能从两份日志里对上。"
        : `答对了 ${graded.correct}/${graded.total} 个。${graded.hints.join("")}`,
    },
  };
}

export function validatePipesLab(input: unknown): Verdict {
  return terminal(input, "pipes", gradePipes);
}

export function validatePermsLab(input: unknown): Verdict {
  const modes = fields<PermKey>(input, "modes", PERM_ITEMS.map((item) => item.key), 4);
  if (!modes) return bad("权限设置不完整。");
  const result = evaluatePerms(modes);
  if (result.invalid.length) return bad(`这些权限不是三位八进制数：${result.invalid.join("、")}。`);
  const wrong = result.scenarios.filter((scenario) => !scenario.ok);
  return {
    passed: result.passed,
    feedback: { message: result.passed ? "该开的都开了，不该开的一个也没开。" : `还有 ${wrong.length} 个场景不满足：${wrong.map((scenario) => scenario.label).join("；")}。` },
  };
}

export function validateProcessLab(input: unknown): Verdict {
  return terminal(input, "processes", gradeProcesses);
}

export function validateEnvLab(input: unknown): Verdict {
  return terminal(input, "env", gradeEnv);
}

export function validateDiskLab(input: unknown): Verdict {
  return terminal(input, "disk", gradeDisk);
}
