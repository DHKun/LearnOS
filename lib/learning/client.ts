import { ApiClientError, apiFetch } from "@/lib/client/api";
import { createUuid } from "@/lib/uuid";
import type { LearningSDK, LearningState, LearningStateSnapshot } from "@/lib/learning/types";

type PendingSave = {
  resolve: (value: { version: number }) => void;
  reject: (error: Error) => void;
};

const SAVE_DEBOUNCE_MS = 600;

/**
 * Native, same-origin implementation of the LearningSDK contract.
 * Enrollment and lesson are bound by the server-rendered provider; the client
 * never sends or chooses a student identity.
 */
export class LearningClient implements LearningSDK {
  private readonly lessonId: string;
  private readonly enrollmentId: string;
  private version: number;
  private started = false;
  private sessionId = createUuid();
  private pendingState: LearningState | null = null;
  private pendingSaves: PendingSave[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;

  constructor(options: {
    lessonId: string;
    enrollmentId: string;
    initialVersion: number;
  }) {
    this.lessonId = options.lessonId;
    this.enrollmentId = options.enrollmentId;
    this.version = options.initialVersion;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.sendEvent("session_start", { sessionId: this.sessionId }, undefined, this.sessionId);
  }

  track(type: string, payload: Record<string, unknown> = {}, stepId?: string): void {
    if (!/^[a-z][a-z0-9_.:-]{0,63}$/.test(type)) return;
    if (JSON.stringify(payload).length > 8 * 1024) return;
    this.sendEvent(type, payload, stepId);
  }

  saveState(state: LearningState): Promise<{ version: number }> {
    this.pendingState = state;

    const promise = new Promise<{ version: number }>((resolve, reject) => {
      this.pendingSaves.push({ resolve, reject });
    });

    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.flushState(false);
    }, SAVE_DEBOUNCE_MS);

    return promise;
  }

  async complete(_stepId?: string): Promise<{ recorded: boolean }> {
    try {
      await apiFetch(`/api/lessons/${this.lessonId}/complete`, {
        method: "POST",
        body: JSON.stringify({ enrollmentId: this.enrollmentId }),
      });
      return { recorded: true };
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        (error.code === "SERVER_VALIDATION_REQUIRED" ||
          error.code === "QUIZ_REQUIRES_SUBMISSION" ||
          error.code === "ENROLLMENT_NOT_ACTIVE")
      ) {
        return { recorded: false };
      }
      throw error;
    }
  }

  async submit(
    _submission: Record<string, unknown>,
  ): Promise<{ passed: boolean; feedback?: Record<string, unknown> }> {
    // Formal graded content is always submitted through a BlockScope, which
    // replaces this method with the authenticated block endpoint.
    throw new Error("BLOCK_SUBMISSION_REQUIRED");
  }

  async refreshState(): Promise<LearningStateSnapshot> {
    const snapshot = await apiFetch<LearningStateSnapshot>(
      `/api/learning/states/${this.lessonId}`,
    );
    this.version = snapshot.version;
    return snapshot;
  }

  async flushOnUnload(): Promise<void> {
    if (!this.pendingState) return;
    await this.flushState(true);
  }

  private sendEvent(
    type: string,
    payload: Record<string, unknown>,
    stepId?: string,
    fixedId?: string,
  ): void {
    void apiFetch("/api/learning/events", {
      method: "POST",
      body: JSON.stringify({
        id: fixedId ?? createUuid(),
        enrollmentId: this.enrollmentId,
        lessonId: this.lessonId,
        type,
        stepId: stepId ?? null,
        payload,
      }),
    }).catch(() => undefined);
  }

  private async flushState(keepalive: boolean): Promise<void> {
    if (this.inflight) {
      await this.inflight.catch(() => undefined);
    }

    const state = this.pendingState;
    if (!state) return;

    const saves = this.pendingSaves;
    this.pendingState = null;
    this.pendingSaves = [];
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    const request = apiFetch<{ version: number }>(
      `/api/learning/states/${this.lessonId}`,
      {
        method: "PUT",
        keepalive,
        body: JSON.stringify({
          enrollmentId: this.enrollmentId,
          state,
          expectedVersion: this.version,
        }),
      },
    );

    this.inflight = request
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.inflight = null;
      });

    try {
      const result = await request;
      this.version = result.version;
      for (const save of saves) save.resolve({ version: result.version });
    } catch (error) {
      if (error instanceof ApiClientError && error.code === "STATE_VERSION_CONFLICT") {
        await this.refreshState().catch(() => undefined);
      }
      for (const save of saves) {
        save.reject(error instanceof Error ? error : new Error("SAVE_FAILED"));
      }
    }
  }
}
