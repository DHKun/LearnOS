import { type PathManifest, loadPaths } from "@/lib/content/paths";
import { listStudentCourses } from "@/lib/services/courses";
import type { CourseListItem, CourseProgress } from "@/lib/types";

export type PathStepState = "completed" | "active" | "abandoned" | "available" | "upcoming";

export type PathStep = {
  slug: string;
  title: string;
  summary: string;
  state: PathStepState;
  /** Only for published courses. */
  courseId: string | null;
  lessonCount: number | null;
  progress: CourseProgress | null;
};

export type PathView = {
  slug: string;
  title: string;
  description: string;
  level: PathManifest["level"];
  steps: PathStep[];
  completed: number;
  /** Published courses on the path; upcoming ones are not counted yet. */
  available: number;
  /** The course to work on next: the first published course not yet completed. */
  next: PathStep | null;
};

export type CoursePathContext = {
  path: { slug: string; title: string };
  position: number;
  total: number;
  /** The next published, not yet completed course after this one on the path. */
  next: PathStep | null;
};

/** Pure: combine path definitions with the courses the learner can see. */
export function buildPathViews(paths: PathManifest[], courses: CourseListItem[]): PathView[] {
  const bySlug = new Map(courses.map((course) => [course.slug, course]));
  return paths.map((path) => {
    const steps: PathStep[] = path.courses.map((entry) => {
      const course = bySlug.get(entry.course);
      if (!course) {
        return {
          slug: entry.course,
          title: entry.title ?? entry.course,
          summary: entry.summary,
          state: "upcoming",
          courseId: null,
          lessonCount: null,
          progress: null,
        };
      }
      const state: PathStepState =
        course.myStatus === "completed"
          ? "completed"
          : course.myStatus === "active"
            ? "active"
            : course.myStatus === "abandoned"
              ? "abandoned"
              : "available";
      return {
        slug: course.slug,
        title: course.title,
        summary: entry.summary,
        state,
        courseId: course.id,
        lessonCount: course.lessonCount,
        progress: course.myProgress,
      };
    });
    return {
      slug: path.slug,
      title: path.title,
      description: path.description,
      level: path.level,
      steps,
      completed: steps.filter((step) => step.state === "completed").length,
      available: steps.filter((step) => step.state !== "upcoming").length,
      next: steps.find((step) => step.state !== "completed" && step.state !== "upcoming") ?? null,
    };
  });
}

/** Pure: where a course sits on each path that contains it. */
export function pathContextFor(views: PathView[], courseSlug: string): CoursePathContext[] {
  return views.flatMap((view) => {
    const index = view.steps.findIndex((step) => step.slug === courseSlug);
    if (index < 0) return [];
    return [
      {
        path: { slug: view.slug, title: view.title },
        position: index + 1,
        total: view.steps.length,
        next: view.steps.slice(index + 1).find((step) => step.state !== "completed" && step.state !== "upcoming") ?? null,
      },
    ];
  });
}

export async function getStudentPaths(studentId: string): Promise<{ paths: PathView[]; courses: CourseListItem[] }> {
  const courses = await listStudentCourses(studentId);
  return { paths: buildPathViews(loadPaths(), courses), courses };
}

export async function getCoursePathContext(studentId: string, courseSlug: string): Promise<CoursePathContext[]> {
  const { paths } = await getStudentPaths(studentId);
  return pathContextFor(paths, courseSlug);
}

export async function getStudentPath(studentId: string, slug: string): Promise<PathView | null> {
  const { paths } = await getStudentPaths(studentId);
  return paths.find((path) => path.slug === slug) ?? null;
}
