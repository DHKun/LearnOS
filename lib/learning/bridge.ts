export const LEARNING_PROTOCOL = "learnos/1" as const;

const MESSAGE_TYPES = ["READY", "TRACK", "SAVE_STATE", "COMPLETE", "SUBMIT"] as const;
export type ChildMessageType = (typeof MESSAGE_TYPES)[number];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ChildMessage = {
  protocol: typeof LEARNING_PROTOCOL;
  nonce: string;
  requestId: string;
  type: ChildMessageType;
  payload?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Parse and validate an inbound iframe message without pulling a schema
 * library into the browser bundle. Mirrors the §6.3 protocol constraints.
 */
export function parseChildMessage(data: unknown): ChildMessage | null {
  if (!isRecord(data)) return null;
  if (data.protocol !== LEARNING_PROTOCOL) return null;
  if (typeof data.nonce !== "string" || data.nonce.length > 128) return null;
  if (typeof data.requestId !== "string" || !UUID_PATTERN.test(data.requestId)) return null;
  if (typeof data.type !== "string" || !MESSAGE_TYPES.includes(data.type as ChildMessageType)) {
    return null;
  }
  if (data.payload !== undefined && !isRecord(data.payload)) return null;

  return {
    protocol: LEARNING_PROTOCOL,
    nonce: data.nonce,
    requestId: data.requestId,
    type: data.type as ChildMessageType,
    ...(data.payload === undefined ? {} : { payload: data.payload }),
  };
}

export type BridgeValidation = {
  ok: boolean;
  reason?:
    | "origin-mismatch"
    | "source-mismatch"
    | "protocol-mismatch"
    | "schema-invalid"
    | "nonce-mismatch";
  message?: ChildMessage;
};

/**
 * Validate an inbound iframe message before it is allowed to touch the API.
 * Mirrors the checks required by MVP-SPEC §6.3.
 */
export function validateIframeMessage(options: {
  data: unknown;
  origin: string;
  expectedOrigin: string;
  sourceMatches: boolean;
  expectedNonce: string;
}): BridgeValidation {
  if (options.origin !== options.expectedOrigin) {
    return { ok: false, reason: "origin-mismatch" };
  }
  if (!options.sourceMatches) {
    return { ok: false, reason: "source-mismatch" };
  }

  const parsed = parseChildMessage(options.data);
  if (!parsed) {
    return { ok: false, reason: "schema-invalid" };
  }

  if (parsed.type === "READY") {
    return { ok: true, message: parsed };
  }

  if (options.expectedNonce === "" || parsed.nonce !== options.expectedNonce) {
    return { ok: false, reason: "nonce-mismatch" };
  }

  return { ok: true, message: parsed };
}

export function resolveLabOrigin(entryUrl: string): string {
  return new URL(entryUrl).origin;
}

export function buildLabUrl(
  entryUrl: string,
  parentOrigin: string,
  theme: "light" | "dark",
): string {
  const url = new URL(entryUrl);
  url.searchParams.set("parentOrigin", parentOrigin);
  url.searchParams.set("theme", theme);
  return url.toString();
}
