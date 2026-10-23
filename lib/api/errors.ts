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
  | "IDEMPOTENCY_KEY_REUSED"
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
  | "BLOCK_NOT_FOUND"
  | "BLOCK_KIND_MISMATCH"
  | "DEPLOYMENT_IN_PROGRESS"
  | "DEPLOYMENT_CONFLICT"
  | "DEPLOYMENT_NOT_AVAILABLE"
  | "DEPLOYMENT_JOB_NOT_FOUND"
  | "ROLLBACK_UNSAFE"
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
  IDEMPOTENCY_KEY_REUSED: 409,
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
  BLOCK_NOT_FOUND: 404,
  BLOCK_KIND_MISMATCH: 400,
  DEPLOYMENT_IN_PROGRESS: 409,
  DEPLOYMENT_CONFLICT: 409,
  DEPLOYMENT_NOT_AVAILABLE: 409,
  DEPLOYMENT_JOB_NOT_FOUND: 404,
  ROLLBACK_UNSAFE: 409,
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
  IDEMPOTENCY_KEY_REUSED: "幂等键已用于不同的请求内容",
  NOTE_TOO_LARGE: "笔记超过 64KB 限制",
  PAYLOAD_TOO_LARGE: "提交内容超过大小限制",
  RATE_LIMITED: "操作过于频繁，请稍后再试",
  QUIZ_REQUIRES_SUBMISSION: "测验必须通过提交接口完成",
  SERVER_VALIDATION_REQUIRED: "该实验必须由服务端验证通过",
  COMPLETION_NOT_ALLOWED: "该章节不支持此完成方式",
  SUBMISSION_NOT_ALLOWED: "该章节不接受实验提交",
  NOT_A_QUIZ: "该章节不是测验",
  BLOCK_NOT_FOUND: "章节内容块不存在",
  BLOCK_KIND_MISMATCH: "内容块类型与提交不匹配",
  VALIDATION_ERROR: "请求参数不合法",
  DEPLOYMENT_IN_PROGRESS: "已有部署任务正在进行，请等待完成",
  DEPLOYMENT_CONFLICT: "课程变更与已有学习记录冲突，已阻止部署",
  DEPLOYMENT_NOT_AVAILABLE: "当前没有可回滚的上一个成功版本",
  DEPLOYMENT_JOB_NOT_FOUND: "部署任务不存在",
  ROLLBACK_UNSAFE: "回滚会破坏现有课程结构或学习记录，已拒绝",
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
