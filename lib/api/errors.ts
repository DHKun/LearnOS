export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "ACCOUNT_DISABLED"
  | "FORBIDDEN"
  | "CSRF_ORIGIN_REJECTED"
  | "NOT_FOUND"
  | "COURSE_NOT_FOUND"
  | "LESSON_NOT_FOUND"
  | "ENROLLMENT_NOT_FOUND"
  | "STUDENT_NOT_FOUND"
  | "QUIZ_NOT_FOUND"
  | "CONFLICT"
  | "ACTIVE_COURSE_EXISTS"
  | "STATE_VERSION_CONFLICT"
  | "COURSE_NOT_AVAILABLE"
  | "ENROLLMENT_NOT_ACTIVE"
  | "EMAIL_EXISTS"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "NOTE_TOO_LARGE"
  | "RATE_LIMITED"
  | "QUIZ_REQUIRES_SUBMISSION"
  | "SERVER_VALIDATION_REQUIRED"
  | "COMPLETION_NOT_ALLOWED"
  | "SUBMISSION_NOT_ALLOWED"
  | "NOT_A_QUIZ"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  ACCOUNT_DISABLED: 403,
  FORBIDDEN: 403,
  CSRF_ORIGIN_REJECTED: 403,
  NOT_FOUND: 404,
  COURSE_NOT_FOUND: 404,
  LESSON_NOT_FOUND: 404,
  ENROLLMENT_NOT_FOUND: 404,
  STUDENT_NOT_FOUND: 404,
  QUIZ_NOT_FOUND: 404,
  CONFLICT: 409,
  ACTIVE_COURSE_EXISTS: 409,
  STATE_VERSION_CONFLICT: 409,
  COURSE_NOT_AVAILABLE: 409,
  ENROLLMENT_NOT_ACTIVE: 409,
  EMAIL_EXISTS: 409,
  VALIDATION_ERROR: 422,
  PAYLOAD_TOO_LARGE: 422,
  NOTE_TOO_LARGE: 422,
  RATE_LIMITED: 429,
  QUIZ_REQUIRES_SUBMISSION: 400,
  SERVER_VALIDATION_REQUIRED: 400,
  COMPLETION_NOT_ALLOWED: 400,
  SUBMISSION_NOT_ALLOWED: 400,
  NOT_A_QUIZ: 400,
  INTERNAL_ERROR: 500,
};

const DEFAULT_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  UNAUTHENTICATED: "请先登录",
  ACCOUNT_DISABLED: "账号已被停用",
  FORBIDDEN: "没有权限执行该操作",
  CSRF_ORIGIN_REJECTED: "请求来源校验失败",
  ACTIVE_COURSE_EXISTS: "请先完成或退出当前课程",
  STATE_VERSION_CONFLICT: "学习状态已在其他页面更新，请刷新后重试",
  COURSE_NOT_AVAILABLE: "课程当前不可参加",
  ENROLLMENT_NOT_ACTIVE: "该课程记录当前不可写",
  NOTE_TOO_LARGE: "笔记超过 64KB 限制",
  PAYLOAD_TOO_LARGE: "提交内容超过大小限制",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  QUIZ_REQUIRES_SUBMISSION: "测验必须通过提交接口完成",
  SERVER_VALIDATION_REQUIRED: "该实验必须由服务端验证通过",
  COMPLETION_NOT_ALLOWED: "该章节不支持此完成方式",
  SUBMISSION_NOT_ALLOWED: "该章节不接受实验提交",
  NOT_A_QUIZ: "该章节不是测验",
  VALIDATION_ERROR: "请求参数不合法",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code] ?? code);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code] ?? 500;
  }
}

const KNOWN_CODES = new Set(Object.keys(STATUS_BY_CODE));

/** Map a database RPC error (`raise exception 'CODE'`) to an API error. */
export function fromDatabaseError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "";

  if (KNOWN_CODES.has(message)) {
    return new ApiError(message as ApiErrorCode);
  }

  if (message === "duplicate key value violates unique constraint") {
    return new ApiError("CONFLICT");
  }

  return new ApiError("INTERNAL_ERROR");
}

export function mapDatabaseError(error: unknown): never {
  throw fromDatabaseError(error);
}
