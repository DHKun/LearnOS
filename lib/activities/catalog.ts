export const ACTIVITY_DEFINITIONS = {
  "sql-injection-lab": {
    title: "SQL 注入审计台",
    validatorId: "sql-injection-lab",
  },
  "idempotency-lab": {
    title: "恰好一次支付",
    validatorId: "idempotency-lab",
  },
} as const;

export type ActivityId = keyof typeof ACTIVITY_DEFINITIONS;

export const ACTIVITY_IDS = Object.keys(ACTIVITY_DEFINITIONS) as [
  ActivityId,
  ...ActivityId[],
];

export function isActivityId(value: string): value is ActivityId {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_DEFINITIONS, value);
}

export function getActivityDefinition(value: string) {
  return isActivityId(value) ? ACTIVITY_DEFINITIONS[value] : null;
}
