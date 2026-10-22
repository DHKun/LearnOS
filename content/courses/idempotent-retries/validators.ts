import {
  isKeyStrategy,
  isRetryPolicy,
  validateIdempotencyConfig,
  type IdempotencyConfig,
} from "@/lib/activities/idempotency";

export type IdempotencyFeedback = {
  passed: boolean;
  message: string;
  charges: number;
  suppressed: number;
  attempts: number;
  timeline: { attempt: number; outcome: string; charged: boolean }[];
  hint?: string;
};

export function validateIdempotencyLab(submission: unknown): {
  passed: boolean;
  feedback: IdempotencyFeedback;
} {
  const raw = submission as Partial<Record<keyof IdempotencyConfig, unknown>> | null;
  const keyStrategy = raw?.keyStrategy;
  const dedupe = raw?.dedupe;
  const retryPolicy = raw?.retryPolicy;
  const maxRetries = raw?.maxRetries;

  if (
    !isKeyStrategy(keyStrategy) ||
    !isRetryPolicy(retryPolicy) ||
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

  const result = validateIdempotencyConfig({
    keyStrategy,
    retryPolicy,
    dedupe,
    maxRetries,
  });

  return {
    passed: result.passed,
    feedback: {
      passed: result.passed,
      message: result.message,
      charges: result.simulation.charges,
      suppressed: result.simulation.suppressed,
      attempts: result.simulation.attempts,
      timeline: result.simulation.timeline,
      hint: result.hint,
    },
  };
}
