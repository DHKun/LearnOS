import { getActivityDefinition } from "@/lib/activities/catalog";
import {
  chapterBlocks,
  resolveChapterCompletion,
  type ResolvedChapterCompletion,
} from "@/lib/content/chapters";
import {
  readBlockQuizFile,
  type LoadedCourse,
} from "@/lib/content/loader";
import type { ArticleLessonManifest } from "@/lib/content/manifest";
import { publicQuizQuestion } from "@/lib/content/quiz";
import type { ChapterBlockSummary, ChapterCompletionSummary } from "@/lib/types";

export type PublicChapterBlock = ChapterBlockSummary & {
  questions?: {
    id: string;
    prompt: string;
    type: "single" | "multiple";
    options: { id: string; label: string }[];
  }[];
};

const IS_PRODUCTION = process.env.NODE_ENV === "production" && !process.env.LEARNOS_CONTENT_ROOT;
const blockCache = new Map<
  string,
  { blocks: PublicChapterBlock[]; completion: ChapterCompletionSummary }
>();

export function resolveChapterBlocks(
  course: LoadedCourse,
  lesson: ArticleLessonManifest,
): { blocks: PublicChapterBlock[]; completion: ChapterCompletionSummary } {
  const cacheKey = `${course.slug}::${lesson.slug}`;
  if (IS_PRODUCTION) {
    const cached = blockCache.get(cacheKey);
    if (cached) return cached;
  }
  const blocks = chapterBlocks(lesson).map((block) => {
    if (block.kind === "simulation") {
      const activity = getActivityDefinition(block.activityId);
      return {
        id: block.id,
        kind: block.kind,
        activityId: block.activityId,
        title: block.title ?? activity?.title,
      };
    }
    const quiz = readBlockQuizFile(course, lesson, block);
    return {
      id: block.id,
      kind: block.kind,
      title: block.title,
      passScore: block.passScore ?? quiz.passScore,
      questionCount: quiz.questions.length,
      questions: quiz.questions.map(publicQuizQuestion),
    };
  });
  const completion = resolveChapterCompletion(lesson);
  const resolved = {
    blocks,
    completion: {
      mode: completion.mode,
      requiredBlocks: completion.requiredBlocks,
    },
  };
  if (IS_PRODUCTION) blockCache.set(cacheKey, resolved);
  return resolved;
}

export type { ResolvedChapterCompletion };
