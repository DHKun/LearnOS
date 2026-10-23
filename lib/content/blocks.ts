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

export function resolveChapterBlocks(
  course: LoadedCourse,
  lesson: ArticleLessonManifest,
): { blocks: PublicChapterBlock[]; completion: ChapterCompletionSummary } {
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
  return {
    blocks,
    completion: {
      mode: completion.mode,
      requiredBlocks: completion.requiredBlocks,
    },
  };
}

export type { ResolvedChapterCompletion };
