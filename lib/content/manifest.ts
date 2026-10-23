import { z } from "zod";

const safeRelativePath = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => !value.startsWith("/") && !value.includes("..") && !value.includes("\\"), {
    message: "资源路径必须是课程目录内的相对路径",
  });

export const chapterBlockIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Block ID 只能使用小写字母、数字和连字符");
export const chapterCompletionModeSchema = z.enum(["manual", "all", "any"]);

/** A block declared in a chapter. MDX renders it; the manifest validates it. */
export const chapterBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    id: chapterBlockIdSchema,
    kind: z.literal("simulation"),
    activityId: z.string().min(1).max(160),
    title: z.string().min(1).max(160).optional(),
  }),
  z.object({
    id: chapterBlockIdSchema,
    kind: z.literal("question"),
    source: safeRelativePath,
    passScore: z.number().min(0).max(100).optional(),
    title: z.string().min(1).max(160).optional(),
  }),
]);

export const chapterCompletionSchema = z.object({
  mode: chapterCompletionModeSchema,
  requiredBlocks: z.array(chapterBlockIdSchema).default([]),
});

/**
 * The only formal course unit: a chapter always has MDX prose. Simulations and
 * graded questions are optional blocks declared here and rendered by MDX.
 */
export const lessonManifestSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "slug 只能使用小写字母、数字和连字符"),
  title: z.string().min(1).max(160),
  required: z.boolean().default(true),
  /** Optional logical grouping; no extra database table is required. */
  unit: z.string().min(1).max(80).optional(),
  source: safeRelativePath.refine((value) => value.endsWith(".mdx"), {
    message: "章节正文必须使用 .mdx 资源",
  }),
  /** Optional in-chapter blocks. Plain MDX remains valid without them. */
  blocks: z.array(chapterBlockSchema).max(50).optional(),
  /** How the chapter completes. Absent means manual. */
  completion: chapterCompletionSchema.optional(),
  /** Optional final assessment flag; at most one per course. */
  finalExam: z.boolean().optional(),
});

const pluginComponent = z.object({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  component: safeRelativePath,
  export: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  title: z.string().min(1).max(160).optional(),
  analogy: z.string().min(1).max(500).optional(),
});

const pluginActivity = pluginComponent.extend({
  validator: z.object({
    path: safeRelativePath,
    export: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  }),
});

const pluginsSchema = z.object({
  concepts: z.array(pluginComponent).default([]),
  activities: z.array(pluginActivity).default([]),
});

export const courseManifestSchema = z
  .object({
    schemaVersion: z.literal(3, {
      errorMap: () => ({ message: "课程清单必须使用 schemaVersion: 3" }),
    }),
    plugins: pluginsSchema.optional(),
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
    let finalExams = 0;
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
      if (lesson.finalExam) {
        finalExams += 1;
        if (!lesson.required) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lessons", index, "finalExam"],
            message: "finalExam 章节必须是必修章节",
          });
        }
      }

      const blocks = lesson.blocks ?? [];
      const blockIds = new Set<string>();
      for (const [blockIndex, block] of blocks.entries()) {
        if (blockIds.has(block.id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lessons", index, "blocks", blockIndex, "id"],
            message: `Block ID 重复: ${block.id}`,
          });
        }
        blockIds.add(block.id);
      }

      const completion = lesson.completion;
      if (completion) {
        const required = completion.requiredBlocks;
        if (new Set(required).size !== required.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lessons", index, "completion", "requiredBlocks"],
            message: "requiredBlocks 不能重复",
          });
        }
        if (completion.mode === "manual") {
          if (required.length > 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["lessons", index, "completion", "requiredBlocks"],
              message: "manual 完成模式不能声明 requiredBlocks",
            });
          }
        } else {
          if (required.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["lessons", index, "completion", "requiredBlocks"],
              message: "all/any 完成模式至少需要一个 requiredBlock",
            });
          }
          const blocksById = new Map(blocks.map((block) => [block.id, block]));
          for (const [requiredIndex, blockId] of required.entries()) {
            if (!blocksById.has(blockId)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["lessons", index, "completion", "requiredBlocks", requiredIndex],
                message: `requiredBlock 不存在: ${blockId}`,
              });
            }
          }
        }
      }

      if (lesson.finalExam) {
        if (!completion || completion.mode === "manual") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["lessons", index, "finalExam"],
            message: "finalExam 章节必须声明 all/any 正式完成规则",
          });
        } else {
          const hasQuestion = completion.requiredBlocks.some(
            (blockId) => blocks.find((block) => block.id === blockId)?.kind === "question",
          );
          if (!hasQuestion) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["lessons", index, "finalExam"],
              message: "finalExam 章节必须包含必需的知识检查 Block",
            });
          }
        }
      }
    });

    if (requiredCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "课程至少需要 1 个必修章节",
      });
    }
    if (finalExams > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lessons"],
        message: "课程最多只能有一个 finalExam 章节",
      });
    }
  });

export const quizOptionSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(500),
});

const quizQuestionBase = {
  id: z.string().min(1).max(80),
  prompt: z.string().min(1).max(2000),
  explanation: z.string().max(2000).optional(),
};

export const quizQuestionSchema = z
  .discriminatedUnion("type", [
    z.object({
      ...quizQuestionBase,
      type: z.literal("single"),
      options: z.array(quizOptionSchema).min(2).max(8),
      answer: z.string().min(1),
    }),
    z.object({
      ...quizQuestionBase,
      type: z.literal("multiple"),
      options: z.array(quizOptionSchema).min(2).max(8),
      answer: z.array(z.string().min(1)).min(1),
    }),
    z.object({
      ...quizQuestionBase,
      type: z.literal("boolean"),
      answer: z.boolean(),
    }),
  ])
  .superRefine((question, ctx) => {
    if (question.type === "boolean") return;

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

export type ChapterManifest = z.infer<typeof lessonManifestSchema>;
export type LessonManifest = ChapterManifest;
/** Backwards-compatible alias while call sites migrate to ChapterManifest. */
export type ArticleLessonManifest = ChapterManifest;
export type ChapterBlock = z.infer<typeof chapterBlockSchema>;
export type ChapterCompletion = z.infer<typeof chapterCompletionSchema>;
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
