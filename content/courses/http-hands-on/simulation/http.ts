/**
 * HTTP message primitives for the teaching simulator.
 * Pure and deterministic; shared by browser components and server validators.
 * Never performs network I/O.
 */

export type Method = "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
export const METHODS: Method[] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

export type Header = { name: string; value: string };

/** What the learner edits: a request as a browser `fetch` would describe it. */
export type LabRequest = {
  method: Method;
  url: string;
  headers: Header[];
  body: string;
};

/** What actually goes over the wire after the simulated browser processes it. */
export type WireRequest = {
  method: Method;
  target: string;
  headers: Header[];
  body: string;
};

export type LabResponse = {
  status: number;
  reason: string;
  headers: Header[];
  body: string;
  /** Teaching explanation; not part of the HTTP message. */
  note: string;
};

/** A network-level failure: no HTTP response exists at all. */
export type NetworkError = {
  error: "ERR_NAME_NOT_RESOLVED" | "ERR_CONNECTION_REFUSED" | "ERR_INVALID_URL";
  note: string;
};

export const REASONS: Record<number, string> = {
  200: "OK",
  201: "Created",
  204: "No Content",
  301: "Moved Permanently",
  302: "Found",
  304: "Not Modified",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  409: "Conflict",
  415: "Unsupported Media Type",
  500: "Internal Server Error",
  503: "Service Unavailable",
};

export const LIMITS = {
  url: 500,
  headers: 20,
  headerName: 100,
  headerValue: 1000,
  body: 4000,
  history: 20,
} as const;

export function getHeader(headers: Header[], name: string): string | undefined {
  const lower = name.toLowerCase();
  return headers.find((header) => header.name.trim().toLowerCase() === lower)?.value.trim();
}

/** Headers a page script may not set itself; the browser owns them. */
export const BROWSER_MANAGED = ["host", "cookie", "content-length"];

export function isBrowserManaged(name: string): boolean {
  return BROWSER_MANAGED.includes(name.trim().toLowerCase());
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function makeResponse(
  status: number,
  headers: Header[],
  body: unknown,
  note: string,
): LabResponse {
  const text =
    status === 204 || status === 304 || body === undefined
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body, null, 2);
  const all = [...headers];
  if (text && !getHeader(all, "content-length")) {
    all.push({ name: "Content-Length", value: String(byteLength(text)) });
  }
  return { status, reason: REASONS[status] ?? "Unknown", headers: all, body: text, note };
}

export function requestText(request: WireRequest): string {
  const lines = [`${request.method} ${request.target} HTTP/1.1`];
  for (const header of request.headers) lines.push(`${header.name}: ${header.value}`);
  return `${lines.join("\n")}\n${request.body ? `\n${request.body}` : ""}`;
}

export function responseText(response: LabResponse): string {
  const lines = [`HTTP/1.1 ${response.status} ${response.reason}`];
  for (const header of response.headers) lines.push(`${header.name}: ${header.value}`);
  return `${lines.join("\n")}\n${response.body ? `\n${response.body}` : ""}`;
}

export function statusFamily(status: number): "info" | "success" | "redirect" | "client" | "server" {
  if (status < 200) return "info";
  if (status < 300) return "success";
  if (status < 400) return "redirect";
  if (status < 500) return "client";
  return "server";
}

// ---------------------------------------------------------------------------
// Defensive parsing shared by component state restore and server validators.
// ---------------------------------------------------------------------------

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseHeaders(value: unknown): Header[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > LIMITS.headers) return null;
  const headers: Header[] = [];
  for (const item of value) {
    const record = asRecord(item);
    if (!record || typeof record.name !== "string" || typeof record.value !== "string") return null;
    if (record.name.length > LIMITS.headerName || record.value.length > LIMITS.headerValue) return null;
    headers.push({ name: record.name, value: record.value });
  }
  return headers;
}

/** Strict parse: returns null for anything malformed or oversized. */
export function parseLabRequest(value: unknown): LabRequest | null {
  const record = asRecord(value);
  if (!record) return null;
  if (!METHODS.includes(record.method as Method)) return null;
  if (typeof record.url !== "string" || record.url.length === 0 || record.url.length > LIMITS.url) {
    return null;
  }
  const body = record.body === undefined ? "" : record.body;
  if (typeof body !== "string" || body.length > LIMITS.body) return null;
  const headers = parseHeaders(record.headers);
  if (!headers) return null;
  return { method: record.method as Method, url: record.url, headers, body };
}

export function parseHistory(value: unknown): LabRequest[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.history) return null;
  const parsed = value.map(parseLabRequest);
  return parsed.some((item) => item === null) ? null : (parsed as LabRequest[]);
}
