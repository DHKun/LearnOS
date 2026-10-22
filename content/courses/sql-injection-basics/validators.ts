/**
 * Server-side validator for the SQL injection audit lab.
 *
 * The lab sends only the list of defences the student enabled. The validator
 * re-runs the same deterministic model on the server; the browser copy is for
 * feedback only and is never trusted.
 */

const DEFENCES = [
  "parameterize",
  "escape-quotes",
  "strip-comments",
  "type-cast",
  "allowlist-identifier",
] as const;

type Defence = (typeof DEFENCES)[number];

type Payload = {
  id: string;
  label: string;
  kind: "quoted" | "comment" | "numeric";
};

const PAYLOADS: Payload[] = [
  { id: "classic", label: "' OR '1'='1' --", kind: "quoted" },
  { id: "comment", label: "admin'--", kind: "comment" },
  { id: "union", label: "' UNION SELECT password FROM users--", kind: "quoted" },
  { id: "numeric", label: "1 OR 1=1", kind: "numeric" },
];

const KIND_REQUIREMENT: Record<Payload["kind"], Defence[]> = {
  quoted: ["escape-quotes"],
  comment: ["escape-quotes", "strip-comments"],
  numeric: ["type-cast"],
};

export type SqlInjectionFeedback = {
  passed: boolean;
  message: string;
  results: { id: string; label: string; blocked: boolean }[];
  hint?: string;
};

function isDefence(value: string): value is Defence {
  return (DEFENCES as readonly string[]).includes(value);
}

export function validateSqlInjectionLab(submission: unknown): {
  passed: boolean;
  feedback: SqlInjectionFeedback;
} {
  const raw = submission as { defences?: unknown } | null;
  const list = Array.isArray(raw?.defences)
    ? raw.defences.filter((item): item is Defence => typeof item === "string" && isDefence(item))
    : [];

  if (list.length === 0) {
    return {
      passed: false,
      feedback: {
        passed: false,
        message: "请选择至少一种有效的防御措施后再提交。",
        results: [],
      },
    };
  }

  const defences = new Set<Defence>(list);

  const results = PAYLOADS.map((payload) => {
    const blocked = defences.has("parameterize")
      ? true
      : KIND_REQUIREMENT[payload.kind].some((defence) => defences.has(defence));
    return { id: payload.id, label: payload.label, blocked };
  });

  const passed = results.every((result) => result.blocked);
  const unblocked = results.filter((result) => !result.blocked);

  return {
    passed,
    feedback: {
      passed,
      message: passed
        ? "登录查询已阻止全部注入载荷，同时正常邮箱仍可登录。"
        : `仍有 ${unblocked.length} 个载荷可以改变查询结构。`,
      results,
      hint: passed
        ? undefined
        : "提示：不同载荷的注入点不同——引号上下文、注释符和数值上下文需要分别处理。",
    },
  };
}
