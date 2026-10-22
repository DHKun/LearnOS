export type LearningState = Record<string, unknown>;

export type LearningStateSnapshot = {
  state: LearningState | null;
  version: number;
  updatedAt: string | null;
};

export interface LearningSDK {
  start(): void;
  track(type: string, payload?: Record<string, unknown>, stepId?: string): void;
  saveState(state: LearningState): Promise<{ version: number }>;
  complete(stepId?: string): Promise<{ recorded: boolean }>;
  submit(submission: Record<string, unknown>): Promise<{
    passed: boolean;
    feedback?: Record<string, unknown>;
  }>;
  refreshState(): Promise<LearningStateSnapshot>;
}

export type ActivityComponentProps = {
  readOnly: boolean;
};
