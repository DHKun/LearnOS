/**
 * Pure simulation model for the idempotency / retry activity.
 * Shared by the React activity and the server-side validator.
 */

export const IDEMPOTENCY_KEY_STRATEGIES = [
  {
    id: "stable",
    title: "按业务操作生成稳定键",
    description: "点击支付时生成一次，写入本地状态；所有重试复用同一个键。",
  },
  {
    id: "random",
    title: "每次请求生成新 UUID",
    description: "实现简单，但每次重试看起来都是新的业务操作。",
  },
  {
    id: "none",
    title: "不发送幂等键",
    description: "服务端只能把每个请求当成独立操作。",
  },
] as const;

export const IDEMPOTENCY_RETRY_POLICIES = [
  {
    id: "same-key",
    title: "重试复用同一个键",
    description: "正确的做法：键随业务操作走，不随网络重试变化。",
  },
  {
    id: "new-key",
    title: "重试时重新生成键",
    description: "去重表会把重试当成新操作，导致重复副作用。",
  },
] as const;

export type KeyStrategy = (typeof IDEMPOTENCY_KEY_STRATEGIES)[number]["id"];
export type RetryPolicy = (typeof IDEMPOTENCY_RETRY_POLICIES)[number]["id"];

export const RETRY_FAULTS = 3;

export type IdempotencyConfig = {
  keyStrategy: KeyStrategy;
  retryPolicy: RetryPolicy;
  dedupe: boolean;
  maxRetries: number;
};

export type IdempotencyTimelineItem = {
  attempt: number;
  outcome: string;
  charged: boolean;
};

export type IdempotencySimulation = {
  charges: number;
  suppressed: number;
  attempts: number;
  timeline: IdempotencyTimelineItem[];
  gaveUp: boolean;
  dedupeEffective: boolean;
};

export function isKeyStrategy(value: unknown): value is KeyStrategy {
  return (
    typeof value === "string" &&
    IDEMPOTENCY_KEY_STRATEGIES.some((strategy) => strategy.id === value)
  );
}

export function isRetryPolicy(value: unknown): value is RetryPolicy {
  return (
    typeof value === "string" &&
    IDEMPOTENCY_RETRY_POLICIES.some((policy) => policy.id === value)
  );
}

export function normalizeIdempotencyConfig(input: Partial<IdempotencyConfig>): IdempotencyConfig {
  return {
    keyStrategy: isKeyStrategy(input.keyStrategy) ? input.keyStrategy : "random",
    retryPolicy: isRetryPolicy(input.retryPolicy) ? input.retryPolicy : "new-key",
    dedupe: input.dedupe === true,
    maxRetries:
      typeof input.maxRetries === "number" && Number.isInteger(input.maxRetries)
        ? Math.max(0, Math.min(5, input.maxRetries))
        : 2,
  };
}

export function simulateIdempotency(config: IdempotencyConfig): IdempotencySimulation {
  const attempts = Math.min(config.maxRetries, RETRY_FAULTS) + 1;
  const stableKey = config.keyStrategy === "stable" && config.retryPolicy === "same-key";
  const dedupeEffective = config.dedupe && stableKey;

  let charges = 0;
  let suppressed = 0;
  const timeline: IdempotencyTimelineItem[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const duplicate = dedupeEffective && charges > 0;
    if (duplicate) suppressed += 1;
    else charges += 1;

    const fault = attempt <= RETRY_FAULTS;
    timeline.push({
      attempt,
      outcome: fault
        ? attempt % 2 === 0
          ? "响应丢失（服务端已执行）"
          : "网关超时（结果未知）"
        : "成功返回",
      charged: !duplicate,
    });
  }

  return {
    charges,
    suppressed,
    attempts,
    timeline,
    gaveUp: config.maxRetries < RETRY_FAULTS,
    dedupeEffective,
  };
}

export function validateIdempotencyConfig(config: IdempotencyConfig): {
  passed: boolean;
  message: string;
  simulation: IdempotencySimulation;
  hint?: string;
} {
  const simulation = simulateIdempotency(config);
  const passed =
    !simulation.gaveUp && simulation.dedupeEffective && simulation.charges === 1;

  let message: string;
  if (simulation.gaveUp) {
    message = `重试预算不足：模拟中有 ${RETRY_FAULTS} 次故障，当前最多重试 ${config.maxRetries} 次，客户端在成功前放弃了。`;
  } else if (!config.dedupe) {
    message = "服务端没有去重存储，每次重试都产生了新的扣款。";
  } else if (!simulation.dedupeEffective) {
    message = "客户端每次重试都使用新键（或没有键），服务端无法识别重复请求。";
  } else {
    message = "重试全部复用同一个幂等键，服务端只扣款一次并复用首次结果。";
  }

  return {
    passed,
    message,
    simulation,
    hint: passed
      ? undefined
      : "提示：一次业务操作只生成一个键；失败时复用该键重试；服务端用唯一约束去重。",
  };
}
