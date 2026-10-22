/**
 * Server-side validator for the idempotency / retry lab.
 * Recomputes the whole simulation from the submitted strategy; never trusts a
 * client-reported "charges" count.
 */

export type IdempotencyFeedback = {
  passed: boolean;
  message: string;
  charges: number;
  suppressed: number;
  attempts: number;
  timeline: { attempt: number; outcome: string; charged: boolean }[];
  hint?: string;
};

const KEY_STRATEGIES = ["stable", "random", "none"] as const;
const RETRY_POLICIES = ["same-key", "new-key"] as const;

type KeyStrategy = (typeof KEY_STRATEGIES)[number];
type RetryPolicy = (typeof RETRY_POLICIES)[number];

export function validateIdempotencyLab(submission: unknown): {
  passed: boolean;
  feedback: IdempotencyFeedback;
} {
  const raw = submission as {
    keyStrategy?: unknown;
    dedupe?: unknown;
    retryPolicy?: unknown;
    maxRetries?: unknown;
  } | null;

  const keyStrategy = raw?.keyStrategy;
  const dedupe = raw?.dedupe;
  const retryPolicy = raw?.retryPolicy;
  const maxRetries = raw?.maxRetries;

  if (
    typeof keyStrategy !== "string" ||
    !(KEY_STRATEGIES as readonly string[]).includes(keyStrategy) ||
    typeof retryPolicy !== "string" ||
    !(RETRY_POLICIES as readonly string[]).includes(retryPolicy) ||
    typeof dedupe !== "boolean" ||
    typeof maxRetries !== "number" ||
    !Number.isInteger(maxRetries) ||
    maxRetries < 0 ||
    maxRetries > 5
  ) {
    return {
      passed: false,
      feedback: {
        passed: false,
        message: "提交参数无效，请重新运行实验后再提交。",
        charges: 0,
        suppressed: 0,
        attempts: 0,
        timeline: [],
      },
    };
  }

  const strategy = keyStrategy as KeyStrategy;
  const policy = retryPolicy as RetryPolicy;

  // The simulated operation is delivered at-least-once. Three faults force
  // the client to retry before it can observe success.
  const faults = 3;
  const attempts = Math.min(maxRetries, faults) + 1;
  const stableKey = strategy === "stable" && policy === "same-key";
  const dedupeEffective = dedupe && stableKey;

  const timeline: IdempotencyFeedback["timeline"] = [];
  let charges = 0;
  let suppressed = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const isDuplicate = dedupeEffective && charges > 0;
    if (isDuplicate) {
      suppressed += 1;
    } else {
      charges += 1;
    }
    const fault = attempt <= faults;
    const outcome = fault
      ? attempt % 2 === 0
        ? "响应丢失（服务端已执行）"
        : "网关超时（结果未知）"
      : "成功返回";
    timeline.push({ attempt, outcome, charged: !isDuplicate });
  }

  const gaveUp = maxRetries < faults;
  const passed = !gaveUp && dedupeEffective && charges === 1;

  let message: string;
  if (gaveUp) {
    message = `重试预算不足：模拟中有 ${faults} 次故障，当前最多重试 ${maxRetries} 次，客户端在成功前放弃了。`;
  } else if (!dedupe) {
    message = "服务端没有去重存储，每次重试都产生了新的扣款。";
  } else if (!stableKey) {
    message = "客户端每次重试都使用新键（或没有键），服务端无法识别重复请求。";
  } else {
    message = "重试全部复用同一个幂等键，服务端只扣款一次并复用首次结果。";
  }

  return {
    passed,
    feedback: {
      passed,
      message,
      charges,
      suppressed,
      attempts,
      timeline,
      hint: passed
        ? undefined
        : "提示：一次业务操作只生成一个键；失败时复用该键重试；服务端用唯一约束去重。",
    },
  };
}
