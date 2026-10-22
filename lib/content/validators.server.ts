import { validateIdempotencyLab } from "@/content/courses/idempotent-retries/validators";
import { validateSqlInjectionLab } from "@/content/courses/sql-injection-basics/validators";

export type ValidatorResult = {
  passed: boolean;
  feedback: Record<string, unknown>;
};

export type LabValidator = (submission: unknown) => ValidatorResult;

const VALIDATORS: Record<string, LabValidator> = {
  "sql-injection-lab": (submission) => {
    const result = validateSqlInjectionLab(submission);
    return { passed: result.passed, feedback: { ...result.feedback } };
  },
  "idempotency-lab": (submission) => {
    const result = validateIdempotencyLab(submission);
    return { passed: result.passed, feedback: { ...result.feedback } };
  },
};

/**
 * Static registry: course manifests may only reference validators that are
 * explicitly registered here. There is no dynamic import from user input.
 */
export function getValidator(id: string): LabValidator | undefined {
  return VALIDATORS[id];
}

export function listValidatorIds(): string[] {
  return Object.keys(VALIDATORS);
}
