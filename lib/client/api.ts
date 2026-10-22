export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiClientError(
      payload?.error?.message ?? `请求失败（HTTP ${response.status}）`,
      payload?.error?.code ?? "INTERNAL_ERROR",
      response.status,
    );
  }

  return payload?.data as T;
}
