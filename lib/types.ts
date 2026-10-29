export type Role = "student" | "admin";
export type EnrollmentStatus = "active" | "completed" | "abandoned";
export type LessonType = "article" | "interactive" | "quiz";
export type CompletionPolicy = "manual" | "reported" | "server_validated";
export type LessonProgressStatus = "not_started" | "in_progress" | "completed";

export type CourseProgress = {
  total: number;
  completed: number;
  percent: number;
};

export type EnrollmentSummary = {
  id: string;
  courseId: string;
  status: EnrollmentStatus;
  currentLessonId: string | null;
  startedAt: string;
  lastSeenAt: string | null;
  lastInteractionAt: string | null;
  completedAt: string | null;
  progress: CourseProgress;
};

export type ChapterBlockKind = "simulation" | "question";
export type ChapterBlockSummary = {
  id: string;
  kind: ChapterBlockKind;
  activityId?: string;
  title?: string;
  passScore?: number;
  questionCount?: number;
};
export type ChapterCompletionSummary = {
  mode: "manual" | "all" | "any";
  requiredBlocks: string[];
};

export type LessonSummary = {
  id: string;
  slug: string;
  title: string;
  type: LessonType;
  position: number;
  required: boolean;
  completionPolicy: CompletionPolicy;
  /** Optional logical grouping. */
  unit?: string;
  /** Only populated for interactive lessons. */
  activityId?: string;
  /** Manifest v3 mixed chapter blocks, safe for UI. */
  blocks?: ChapterBlockSummary[];
  completion?: ChapterCompletionSummary;
};

export type MyLessonProgress = Record<
  string,
  { status: LessonProgressStatus; completedAt: string | null }
>;

export type CourseListItem = {
  id: string;
  slug: string;
  title: string;
  description: string;
  lessonCount: number;
  status: "draft" | "published" | "archived";
  myStatus: EnrollmentStatus | null;
  myProgress: CourseProgress | null;
};

export type CourseDetail = {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: "draft" | "published" | "archived";
    contentVersion: string;
  };
  lessons: LessonSummary[];
  myEnrollment: EnrollmentSummary | null;
  myLessonProgress: MyLessonProgress;
};

export type CurrentEnrollment = {
  enrollment: EnrollmentSummary;
  course: {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: "draft" | "published" | "archived";
  };
  lessons: LessonSummary[];
  lessonProgress: MyLessonProgress;
  courseProgress: CourseProgress;
};

export type HistoryItem = {
  enrollmentId: string;
  course: { id: string; slug: string; title: string };
  status: EnrollmentStatus;
  progress: CourseProgress;
  startedAt: string;
  completedAt: string | null;
};

export type MeProfile = {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  totalPoints: number;
};

export type PointEvent = {
  id: string;
  delta: number;
  reason: string;
  createdAt: string;
};

export type PointsData = {
  total: number;
  items: PointEvent[];
};

export type PublicQuizQuestion = {
  id: string;
  prompt: string;
  type: "single" | "multiple";
  options: { id: string; label: string }[];
};

export type BlockResultSummary = {
  blockId: string;
  kind: ChapterBlockKind;
  passed: boolean;
  attempts: number;
  score: number | null;
  feedback: Record<string, unknown>;
  firstPassedAt: string | null;
};

export type BlockSubmitResult = {
  accepted: boolean;
  duplicate: boolean;
  passed: boolean;
  score: number | null;
  feedback: Record<string, unknown>;
  blockStatus: "passed" | "failed";
  chapterCompletionSatisfied: boolean;
  chapterCompleted: boolean;
  lessonStatus: string | null;
  courseProgress: CourseProgress;
  enrollmentStatus: EnrollmentStatus;
  pointsAwarded: number;
};

export type NoteData = {
  content: string;
  updatedAt: string | null;
};

export type AdminOverview = {
  studentCount: number;
  activeEnrollmentCount: number;
  onlineCount: number;
  courseCount: number;
  publishedCourseCount: number;
  completedEnrollmentCount: number;
  recentActivity: {
    studentId: string;
    name: string;
    courseTitle: string | null;
    currentLessonTitle: string | null;
    progress: number;
    lastSeenAt: string | null;
    lastInteractionAt: string | null;
    online: boolean;
  }[];
};


export type AdminAttentionItem = {
  studentId: string;
  name: string;
  courseId: string;
  courseTitle: string;
  currentLesson: string | null;
  progress: number;
  lastInteractionAt: string | null;
  startedAt: string;
};

export type AdminAttention = {
  notStarted: AdminAttentionItem[];
  inactive: AdminAttentionItem[];
  stuck: AdminAttentionItem[];
  recentlyCompleted: AdminAttentionItem[];
};

export type AdminStudentRow = {
  id: string;
  name: string;
  email: string | null;
  disabled: boolean;
  activeCourse: { id: string; title: string } | null;
  currentLesson: string | null;
  progress: number;
  enrollmentStatus: EnrollmentStatus | null;
  lastSeenAt: string | null;
  lastInteractionAt: string | null;
  online: boolean;
  points: number;
};

export type AdminStudentDetail = {
  student: {
    id: string;
    name: string;
    email: string | null;
    disabled: boolean;
    createdAt: string;
    points: number;
  };
  current: {
    enrollmentId: string;
    status: EnrollmentStatus;
    courseId: string;
    courseTitle: string;
    courseSlug: string;
    currentLesson: string | null;
    progress: CourseProgress;
    startedAt: string;
    lastSeenAt: string | null;
    lastInteractionAt: string | null;
    completedAt: string | null;
    online: boolean;
  } | null;
  history: {
    enrollmentId: string;
    courseId: string;
    courseTitle: string;
    status: EnrollmentStatus;
    progress: CourseProgress;
    startedAt: string;
    completedAt: string | null;
  }[];
  lessons: {
    lessonId: string;
    title: string;
    type: LessonType;
    position: number;
    required: boolean;
    status: LessonProgressStatus;
    completedAt: string | null;
    completionSource: string | null;
  }[];
  recentEvents: {
    id: string;
    type: string;
    stepId: string | null;
    payload: Record<string, unknown>;
    createdAt: string;
    lessonTitle: string | null;
  }[];
  pointEvents: { id: string; delta: number; reason: string; createdAt: string }[];
};

export type AdminCourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
  contentVersion: string;
  lessonCount: number;
  enrollmentCount: number;
  activeCount: number;
  completedCount: number;
};

export type AdminCourseDetail = {
  course: {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: "draft" | "published" | "archived";
    contentVersion: string;
    createdAt: string;
    updatedAt: string;
  };
  lessons: {
    id: string;
    slug: string;
    title: string;
    type: LessonType;
    position: number;
    required: boolean;
    completionPolicy: CompletionPolicy;
  }[];
  counts: { active: number; completed: number; abandoned: number };
};

export type CourseAnalyticsLesson = {
  id: string;
  title: string;
  position: number;
  required: boolean;
  /** Enrollments that opened the chapter at least once. */
  reached: number;
  completed: number;
  /** Active enrollments whose first unfinished required chapter is this one. */
  waiting: number;
  /** Subset of `waiting` without a learning interaction for `idleDays`. */
  idle: number;
};

export type CourseAnalyticsBlock = {
  lessonId: string;
  lessonTitle: string;
  blockId: string;
  title: string;
  kind: ChapterBlockKind;
  /** Enrollments with at least one attempt. */
  learners: number;
  passed: number;
  /** Tried but have not passed yet. */
  stuck: number;
  attempts: number;
  avgAttemptsToPass: number | null;
  firstTryRate: number | null;
};

export type CourseAnalyticsQuestion = {
  lessonTitle: string;
  blockTitle: string;
  questionId: string;
  prompt: string;
  answered: number;
  wrong: number;
  wrongRate: number;
  wrongChoices: { label: string; count: number }[];
  /** Wrong answers recorded before choices were stored, or left blank. */
  unrecordedWrong: number;
};

export type CourseAnalytics = {
  course: { id: string; slug: string; title: string };
  learners: { total: number; active: number; completed: number; abandoned: number };
  idleDays: number;
  lessons: CourseAnalyticsLesson[];
  blocks: CourseAnalyticsBlock[];
  questions: CourseAnalyticsQuestion[];
};

export type AdminCourseStudentRow = {
  studentId: string;
  name: string;
  email: string | null;
  enrollmentId: string;
  enrollmentStatus: EnrollmentStatus;
  progress: CourseProgress;
  currentLesson: string | null;
  lastSeenAt: string | null;
  lastInteractionAt: string | null;
  online: boolean;
};
