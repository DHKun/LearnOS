import { z } from "zod";

const MAX_JSON_BYTES = 64 * 1024;
const MAX_EVENT_PAYLOAD_BYTES = 8 * 1024;

function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
}

export const uuidSchema = z.string().uuid("必须是 UUID");

export const joinCourseSchema = z.object({ courseId: uuidSchema }).strict();

export const heartbeatSchema = z
  .object({
    enrollmentId: uuidSchema,
    lessonId: uuidSchema.nullable().optional(),
    visible: z.boolean(),
    focused: z.boolean(),
  })
  .strict();

export const eventSchema = z
  .object({
    id: uuidSchema,
    enrollmentId: uuidSchema,
    lessonId: uuidSchema,
    type: z.string().regex(/^[a-z][a-z0-9_.:-]{0,63}$/, "事件类型不合法"),
    stepId: z.string().max(128).nullable().optional(),
    payload: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (jsonBytes(value.payload ?? {}) > MAX_EVENT_PAYLOAD_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["payload"],
        message: "事件载荷超过 8KB",
      });
    }
  });

export const stateSaveSchema = z
  .object({
    enrollmentId: uuidSchema,
    state: z.record(z.unknown()),
    expectedVersion: z.number().int().min(0).max(1_000_000),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (jsonBytes(value.state) > MAX_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state"],
        message: "互动状态超过 64KB",
      });
    }
  });

export const submissionSchema = z
  .object({
    id: uuidSchema,
    enrollmentId: uuidSchema,
    lessonId: uuidSchema,
    submission: z.record(z.unknown()),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (jsonBytes(value.submission) > MAX_JSON_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["submission"],
        message: "提交内容超过 64KB",
      });
    }
  });

export const completeLessonSchema = z.object({ enrollmentId: uuidSchema }).strict();

const answerValueSchema = z.union([
  z.string().max(200),
  z.array(z.string().max(200)).max(8),
]);

export const quizSubmitSchema = z
  .object({
    attemptId: uuidSchema,
    enrollmentId: uuidSchema,
    answers: z.record(z.string().max(100), answerValueSchema),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (Object.keys(value.answers).length > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answers"],
        message: "答案数量超限",
      });
    }
  });

export const noteSchema = z
  .object({ content: z.string() })
  .strict()
  .superRefine((value, ctx) => {
    if (Buffer.byteLength(value.content, "utf8") > 64 * 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "笔记超过 64KB 限制",
      });
    }
  });

export const adminCreateStudentSchema = z
  .object({
    email: z.string().email("邮箱格式不正确").max(320),
    displayName: z.string().trim().min(1).max(120),
    initialPassword: z.string().min(8, "初始密码至少 8 位").max(72),
  })
  .strict();

export const adminPatchStudentSchema = z
  .object({
    disabled: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .refine((value) => value.disabled !== undefined || value.displayName !== undefined, {
    message: "至少提供一个要修改的字段",
  });

export const adminPatchCourseSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().max(2000).optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined || value.description !== undefined || value.status !== undefined,
    { message: "至少提供一个要修改的字段" },
  );

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const studentListQuerySchema = paginationSchema.extend({
  q: z.string().max(120).optional(),
  online: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
  courseId: uuidSchema.optional(),
});

export const courseStudentsQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "completed", "abandoned"]).optional(),
});

export const enrollmentIdSchema = z.object({ enrollmentId: uuidSchema }).strict();

export const deploymentActionSchema = z
  .object({
    action: z.enum(["deploy", "rollback"]),
    /** Optional for an explicit rollback target; defaults to the previous release. */
    targetJobId: uuidSchema.optional(),
  })
  .strict();
