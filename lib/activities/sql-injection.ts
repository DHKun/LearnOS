/**
 * Pure simulation model for the SQL injection audit activity.
 * Shared by the React activity and the server-side validator.
 */

export const SQL_DEFENCES = [
  {
    id: "parameterize",
    title: "使用参数化查询（值绑定）",
    description: "语句结构先固定，用户输入只作为参数值传输。",
  },
  {
    id: "escape-quotes",
    title: "转义单引号",
    description: "把 ' 替换为 ''。能让引号保持字面量，但数值上下文无效。",
  },
  {
    id: "strip-comments",
    title: "移除 SQL 注释符",
    description: "删除 --、#、/* */。可阻止注释截断，但不阻止 UNION。",
  },
  {
    id: "type-cast",
    title: "对数值参数做类型转换",
    description: "强制 id 等数值参数为整数，阻断 1 OR 1=1 这类载荷。",
  },
  {
    id: "allowlist-identifier",
    title: "标识符白名单",
    description: "表名/列名只允许服务端枚举值。对值参数的注入无效。",
  },
] as const;

export type SqlDefenceId = (typeof SQL_DEFENCES)[number]["id"];

export const SQL_PAYLOADS = [
  {
    id: "classic",
    label: "' OR '1'='1' --",
    kind: "quoted",
    context: "邮箱字符串",
  },
  { id: "comment", label: "admin'--", kind: "comment", context: "邮箱字符串" },
  {
    id: "union",
    label: "' UNION SELECT password FROM users--",
    kind: "quoted",
    context: "邮箱字符串",
  },
  { id: "numeric", label: "1 OR 1=1", kind: "numeric", context: "用户 ID 数值" },
] as const;

export type SqlPayload = (typeof SQL_PAYLOADS)[number];
export type SqlPayloadId = SqlPayload["id"];

const KIND_REQUIREMENT: Record<SqlPayload["kind"], SqlDefenceId[]> = {
  quoted: ["escape-quotes"],
  comment: ["escape-quotes", "strip-comments"],
  numeric: ["type-cast"],
};

export function isSqlDefenceId(value: unknown): value is SqlDefenceId {
  return typeof value === "string" && SQL_DEFENCES.some((defence) => defence.id === value);
}

export function isSqlPayloadId(value: unknown): value is SqlPayloadId {
  return typeof value === "string" && SQL_PAYLOADS.some((payload) => payload.id === value);
}

export function payloadBlocked(
  defences: readonly string[],
  payload: SqlPayload,
): boolean {
  if (defences.includes("parameterize")) return true;
  return KIND_REQUIREMENT[payload.kind].some((defence) => defences.includes(defence));
}

export function auditPayloads(defences: readonly string[]) {
  return SQL_PAYLOADS.map((payload) => ({
    id: payload.id,
    label: payload.label,
    context: payload.context,
    blocked: payloadBlocked(defences, payload),
  }));
}

export type SqlInjectionFeedback = {
  passed: boolean;
  message: string;
  results: ReturnType<typeof auditPayloads>;
  hint?: string;
};

export function validateSqlDefences(defences: readonly string[]): SqlInjectionFeedback {
  const valid = defences.filter(isSqlDefenceId);
  const results = auditPayloads(valid);
  const passed = results.every((result) => result.blocked);
  return {
    passed,
    message: passed
      ? "登录查询已阻止全部注入载荷，同时正常邮箱仍可登录。"
      : `仍有 ${results.filter((result) => !result.blocked).length} 个载荷可以改变查询结构。`,
    results,
    hint: passed
      ? undefined
      : "提示：不同载荷的注入点不同——引号上下文、注释符和数值上下文需要分别处理。",
  };
}
