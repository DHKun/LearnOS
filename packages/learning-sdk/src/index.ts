/**
 * LearnOS Learning SDK — runs inside an isolated lab iframe.
 * It never sees Supabase credentials; every action is forwarded to the
 * authenticated parent window over postMessage and validated there.
 */

export type LearnOSState = Record<string, unknown>;

export interface LearningSDK {
  start(): void;
  track(type: string, payload?: Record<string, unknown>, stepId?: string): void;
  saveState(state: LearnOSState): Promise<{ version: number }>;
  complete(stepId?: string): Promise<{ recorded: boolean }>;
  submit(submission: Record<string, unknown>): Promise<{
    passed: boolean;
    feedback?: Record<string, unknown>;
  }>;
  onRestore(handler: (state: LearnOSState | null) => void): void;
}

type Envelope = {
  protocol: string;
  nonce: string;
  requestId: string;
  type: string;
  payload?: Record<string, unknown>;
};

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const PROTOCOL = "learnos/1";
const SDK_VERSION = "1.0.0";
const REQUEST_TIMEOUT = 12_000;

function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const origin = new URL(value).origin;
    if (origin === "null" || origin === "*") return null;
    return origin;
  } catch {
    return null;
  }
}

function isEnvelope(data: unknown): data is Envelope {
  if (typeof data !== "object" || data === null) return false;
  const value = data as Record<string, unknown>;
  return (
    typeof value.protocol === "string" &&
    typeof value.nonce === "string" &&
    typeof value.requestId === "string" &&
    typeof value.type === "string"
  );
}

export class LearningSDKClient implements LearningSDK {
  private parentOrigin: string | null = null;
  private nonce = "";
  private pending = new Map<string, Pending>();
  private restoreHandlers: ((state: LearnOSState | null) => void)[] = [];
  private initReceived = false;
  private restoredState: LearnOSState | null = null;
  private started = false;
  private sessionId = uuid();
  private expectedVersion = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveQueue: Promise<{ version: number }> | null = null;
  private inflightSave: Promise<void> | null = null;
  private latestState: LearnOSState | null = null;
  private resolveSave: ((value: { version: number }) => void) | null = null;
  private rejectSave: ((error: Error) => void) | null = null;
  private readOnly = false;

  constructor() {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    this.parentOrigin =
      safeOrigin(params.get("parentOrigin")) ??
      safeOrigin(document.referrer ? new URL(document.referrer).origin : null);

    window.addEventListener("message", this.handleMessage);
    window.addEventListener("pagehide", this.flushOnUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") this.flushOnUnload();
    });

    if (this.parentOrigin) {
      this.post("READY", { sdkVersion: SDK_VERSION }, uuid(), "");
    }
  }

  start(): void {
    if (this.started || this.readOnly) return;
    this.started = true;
    this.sendEvent("session_start", { sessionId: this.sessionId }, undefined, this.sessionId);
  }

  track(type: string, payload: Record<string, unknown> = {}, stepId?: string): void {
    if (this.readOnly) return;
    if (!/^[a-z][a-z0-9_.:-]{0,63}$/.test(type)) return;
    if (JSON.stringify(payload).length > 8 * 1024) return;
    this.sendEvent(type, payload, stepId);
  }

  async saveState(state: LearnOSState): Promise<{ version: number }> {
    if (this.readOnly) throw new Error("READ_ONLY");
    this.latestState = state;

    if (this.saveQueue) return this.saveQueue;

    this.saveQueue = new Promise<{ version: number }>((resolve, reject) => {
      this.resolveSave = resolve;
      this.rejectSave = reject;
    });

    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.flushState();
    }, 600);

    return this.saveQueue;
  }

  complete(stepId?: string): Promise<{ recorded: boolean }> {
    if (this.readOnly) return Promise.resolve({ recorded: false });
    return this.request("COMPLETE", { stepId: stepId ?? null }).then((data) => ({
      recorded: Boolean((data as { recorded?: boolean }).recorded),
    }));
  }

  async submit(submission: Record<string, unknown>): Promise<{
    passed: boolean;
    feedback?: Record<string, unknown>;
  }> {
    if (this.readOnly) {
      return { passed: false, feedback: { message: "课程已完成，当前为只读复习。" } };
    }
    const data = await this.request("SUBMIT", { submission });
    return {
      passed: Boolean(data.passed),
      feedback: (data.feedback as Record<string, unknown> | undefined) ?? undefined,
    };
  }

  onRestore(handler: (state: LearnOSState | null) => void): void {
    this.restoreHandlers.push(handler);
    if (this.initReceived) handler(this.restoredState);
  }

  // -------------------------------------------------------------------------
  private post(
    type: string,
    payload: Record<string, unknown>,
    requestId: string,
    nonce: string,
  ): void {
    if (!this.parentOrigin) return;
    const envelope: Envelope = {
      protocol: PROTOCOL,
      nonce,
      requestId,
      type,
      payload,
    };
    window.parent.postMessage(envelope, this.parentOrigin);
  }

  private request(type: string, payload: Record<string, unknown>): Promise<any> {
    if (!this.parentOrigin) {
      return Promise.reject(new Error("PARENT_ORIGIN_UNKNOWN"));
    }
    if (!this.initReceived) {
      return Promise.reject(new Error("NOT_INITIALISED"));
    }

    const requestId = uuid();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("REQUEST_TIMEOUT"));
      }, REQUEST_TIMEOUT);

      this.pending.set(requestId, { resolve, reject, timer });
      this.post(type, payload, requestId, this.nonce);
    });
  }

  private sendEvent(
    type: string,
    payload: Record<string, unknown>,
    stepId?: string,
    fixedId?: string,
  ): void {
    if (!this.parentOrigin || !this.initReceived) return;
    void this.request("TRACK", {
      type,
      stepId: stepId ?? null,
      payload,
      ...(fixedId ? { id: fixedId } : {}),
    }).catch(() => undefined);
  }

  private async flushState(): Promise<void> {
    if (this.inflightSave) {
      await this.inflightSave.catch(() => undefined);
    }
    if (!this.latestState || !this.resolveSave || !this.rejectSave) return;
    const state = this.latestState;
    const resolve = this.resolveSave;
    const reject = this.rejectSave;
    this.latestState = null;
    this.resolveSave = null;
    this.rejectSave = null;
    this.saveQueue = null;

    const request = this.request("SAVE_STATE", { state });
    this.inflightSave = request
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        this.inflightSave = null;
      });

    try {
      const data = await request;
      if (typeof data.version === "number") this.expectedVersion = data.version;
      resolve({ version: this.expectedVersion });
    } catch (error) {
      reject(error instanceof Error ? error : new Error("SAVE_FAILED"));
    }
  }

  private flushOnUnload(): void {
    if (this.latestState && this.parentOrigin) {
      this.post("SAVE_STATE", { state: this.latestState, unload: true }, uuid(), this.nonce);
      this.latestState = null;
    }
  }

  private handleMessage = (event: MessageEvent): void => {
    if (!this.parentOrigin) return;
    if (event.origin !== this.parentOrigin) return;
    if (event.source !== window.parent) return;
    if (!isEnvelope(event.data)) return;
    if (event.data.protocol !== PROTOCOL) return;

    const { type, payload, requestId } = event.data;

    if (type === "INIT") {
      this.nonce = event.data.nonce;
      this.initReceived = true;
      const state = (payload?.state ?? null) as { state?: LearnOSState; version?: number } | null;
      this.restoredState = state?.state ?? null;
      if (typeof state?.version === "number") this.expectedVersion = state.version;
      this.readOnly = Boolean(payload?.readOnly);
      for (const handler of this.restoreHandlers) handler(this.restoredState);
      return;
    }

    if (type === "RESULT") {
      const pending = this.pending.get(requestId);
      if (!pending) return;
      this.pending.delete(requestId);
      clearTimeout(pending.timer);
      const ok = Boolean(payload?.ok);
      if (ok) {
        pending.resolve(payload?.data ?? {});
      } else {
        const error = (payload?.error ?? {}) as { code?: string; message?: string };
        pending.reject(new Error(error.message ?? error.code ?? "REQUEST_FAILED"));
      }
    }
  };
}

const sdk = new LearningSDKClient();

declare global {
  interface Window {
    LearningSDK: LearningSDKClient;
  }
}

if (typeof window !== "undefined") {
  window.LearningSDK = sdk;
}

export default sdk;
