import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApiError, fromDatabaseError } from "@/lib/api/errors";

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const detail = first ? `${first.path.join(".") || "body"}: ${first.message}` : undefined;
    return fail("VALIDATION_ERROR", detail ?? "请求参数不合法", 422);
  }

  if (error instanceof ApiError) {
    return fail(error.code, error.message, error.status);
  }

  const mapped = fromDatabaseError(error);
  if (mapped.code !== "INTERNAL_ERROR") {
    return fail(mapped.code, mapped.message, mapped.status);
  }

  console.error("[api] unhandled error", error);
  return fail("INTERNAL_ERROR", "服务器内部错误", 500);
}

const MAX_BODY_BYTES = 256 * 1024;

export async function readJson(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new ApiError("BAD_REQUEST", "Content-Type 必须为 application/json");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE");
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE");
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError("BAD_REQUEST", "请求体不是合法 JSON");
  }
}
