import { z } from "zod";

import { ACTIVITY_IDS } from "@/lib/activities/catalog";

export const lessonTypeSchema = z.enum(["article", "interactive", "quiz"]);
export const completionPolicySchema = z.enum(["manual", "reported", "server_validated"]);

const safeRelativePath = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !value.startsWith("/") && !value.includes("..") && !value.includes("\\"), {
    message: "资源路径必须是课程目录内的相对路径",
  });

const baseLesson = {
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug 只能使用小写字母、数字和连字符"),
  title: z.string().min(1).max(160),
  required: z.boolean().default(true),
  /** Optional logical grouping; no extra database table is required. */
  unit: z.string().min(1).max(80).optional(),
};

export const lessonManifestSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseLesson,
    type: z.literal("article"),
    source: safeRelativePath,
    completionPolicy: completionPolicySchema.default("manual"),
  }),
  z.object({
    ...baseLesson,
    type: z.literal("interactive"),
    activityId: z.enum(ACTIVITY_IDS),
    completionPolicy: completionPolicySchema.default("server_validated"),
    config: z.record(z.unknown()).optional(),
  }),
  z.object({
    ...baseLesson,
    type: z.literal("quiz"),
    source: safeRelativePath,
    completionPolicy: z.literal("server_validated").default("server_validated"),
    finalExam: z.boolean().optional(),
  }),
]);

export const courseManifestSchema = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "课程 slug 只能使用小写字母、数字和连字符"),
    title: z.string().min(1).max(160),
    description: z.string().max(2000).default(""),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, "version 必须是 semver，例如 1.0.0"),
    lessons: z.array(lessonManifestSchema).min(1, "课程至少需要 1 个章节"),
  })
  .superRefine((course, ctx) => {
    const slugs = new Set<string>();
    let requiredCount = 0;
    course.lessons.forEach((lesson, index) => {
      if (slugs.has(lesson.slug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessons", index, "slug"],
          message: `章节 slug 重复: ${lesson.slug}`,
        });
      }
      slugs.add(lesson.slug);
      if (lesson.required) requiredCount += 1;
      if (lesson.type === "article" && lesson.completionPolicy === "server_validated") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessons", index, "completionPolicy"],
          message: "图文章节不能使用 server_validated（没有可运行的验证器）",
        });
      }
      if (lesson.type === "interactive" && lesson.completionPolicy === "manual") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lessons", index, "completionPolicy"],
          message: "交互实验必须使用 reported 或 server_validated",
        });
      }
    });

    if (requiredCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "课程至少需要 1 个必修章节",
      });
    }

    const finalIndexes = course.lessons
      .map((lesson, index) => (lesson.type === "quiz" && lesson.finalExam ? index : -1))
      .filter((index) => index >= 0);

    if (finalIndexes.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "课程必须且只能有一个 finalExam 测验",
      });
    } else if (finalIndexes[0] !== course.lessons.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "finalExam 必须是最后一个章节",
      });
    }
  });

export const quizOptionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(500),
});

export const quizQuestionSchema = z
  .object({
    id: z.string().min(1).max(80),
    prompt: z.string().min(1).max(2000),
    type: z.enum(["single", "multiple"]),
    options: z.array(quizOptionSchema).min(2).max(8),
    answer: z.union([z.string(), z.array(z.string()).min(1)]),
    explanation: z.string().max(2000).optional(),
  })
  .superRefine((question, ctx) => {
    const ids = new Set(question.options.map((option) => option.id));
    if (ids.size !== question.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "选项 id 必须唯一",
      });
    }
    const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
    if (answers.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "答案不能为空",
      });
    }
    for (const answer of answers) {
      if (!ids.has(answer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["answer"],
          message: `答案 ${answer} 不在选项中`,
        });
      }
    }
    if (question.type === "single" && answers.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "单选题只能有一个答案",
      });
    }
    if (question.type === "multiple" && new Set(answers).size !== answers.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "多选题答案不能重复",
      });
    }
  });

export const quizFileSchema = z
  .object({
    passScore: z.number().min(0).max(100).default(70),
    questions: z.array(quizQuestionSchema).min(1).max(50),
  })
  .superRefine((quiz, ctx) => {
    const ids = new Set<string>();
    quiz.questions.forEach((question, index) => {
      if (ids.has(question.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "id"],
          message: `题目 id 重复: ${question.id}`,
        });
      }
      ids.add(question.id);
    });
  });

export type LessonManifest = z.infer<typeof lessonManifestSchema>;
export type CourseManifest = z.infer<typeof courseManifestSchema>;
export type QuizFile = z.infer<typeof quizFileSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;

/** Public shape sent to browsers: never includes `answer` or `explanation`. */
export type PublicQuizQuestion = {
  id: string;
  prompt: string;
  type: "single" | "multiple";
  options: { id: string; label: string }[];
};
