import {
  isSqlDefenceId,
  validateSqlDefences,
  type SqlInjectionFeedback,
} from "@/lib/activities/sql-injection";

export type { SqlInjectionFeedback };

export function validateSqlInjectionLab(submission: unknown): {
  passed: boolean;
  feedback: SqlInjectionFeedback;
} {
  const raw = submission as { defences?: unknown } | null;
  const list = Array.isArray(raw?.defences)
    ? raw.defences.filter((item): item is string => typeof item === "string")
    : [];

  if (list.length === 0 || list.some((item) => !isSqlDefenceId(item))) {
    return {
      passed: false,
      feedback: {
        passed: false,
        message: "请选择至少一种有效的防御措施后再提交。",
        results: [],
      },
    };
  }

  const result = validateSqlDefences(list);
  return { passed: result.passed, feedback: result };
}
