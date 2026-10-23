import type { CompletionPolicy, LessonType } from "@/lib/types";

/** One lesson as recorded in a successful deployment snapshot. */
export type SnapshotLesson = {
  slug: string;
  title: string;
  position: number;
  type: LessonType;
  required: boolean;
  completionPolicy: CompletionPolicy;
  activityId?: string;
  validatorId?: string;
  validatorFingerprint?: string;
  validatorFingerprintVersion?: number;
  passScore?: number;
  finalExam?: boolean;
  quizHash?: string;
  /** V3 mixed chapter: structural signature of required blocks + completion. */
  chapterHash?: string;
  chapterCompletion?: { mode: "manual" | "all" | "any"; requiredBlocks: string[] };
};

export type SnapshotPlugin = {
  id: string;
  globalId: string;
  component: string;
  export: string;
  title?: string;
  analogy?: string;
  validatorId?: string;
  validatorPath?: string;
  validatorExport?: string;
  validatorFingerprint?: string;
};

/** Immutable description of one course directory, stored on every deployment. */
export type DeploymentCourseSnapshot = {
  slug: string;
  title: string;
  version: string;
  description: string;
  sourceDigest: string;
  structuralDigest: string;
  /** Relative path -> SHA-256 of the file content. Used for change display. */
  files: Record<string, string>;
  lessons: SnapshotLesson[];
  concepts: SnapshotPlugin[];
  activities: SnapshotPlugin[];
};

export type CourseScanStatus =
  | "new"
  | "updated"
  | "latest"
  | "conflict"
  | "scan_failed"
  | "removed";

export type ScannedCourse = DeploymentCourseSnapshot & {
  status: CourseScanStatus;
  enrollments: number;
  previousVersion: string | null;
  messages: string[];
  warnings: string[];
  changes: { added: string[]; modified: string[]; removed: string[] };
};

export type CourseScanFailure = {
  slug: string;
  error: string;
};

export type DeploymentScan = {
  scannedAt: string;
  baselineVersion: string | null;
  baselineDeploymentId: string | null;
  items: ScannedCourse[];
  failures: CourseScanFailure[];
  counts: Record<CourseScanStatus, number>;
  canDeploy: boolean;
  blockingReasons: string[];
};

export type DeploymentJobStatus =
  | "queued"
  | "validating"
  | "building"
  | "syncing"
  | "switching"
  | "health_check"
  | "rolling_back"
  | "succeeded"
  | "failed"
  | "rolled_back";

export type DeploymentLogLine = {
  at: string;
  level: "info" | "warn" | "error" | string;
  message: string;
};

export type DeploymentJob = {
  id: string;
  kind: "deploy" | "rollback";
  status: DeploymentJobStatus;
  phase: string | null;
  deploymentVersion: string;
  imageTag: string | null;
  imageId: string | null;
  previousVersion: string | null;
  previousImageId: string | null;
  rollbackTargetJobId: string | null;
  requestedBy: string | null;
  courses: DeploymentCourseSnapshot[];
  result: Record<string, unknown>;
  logs: DeploymentLogLine[];
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  heartbeatAt: string | null;
};

export type DeploymentState = {
  currentVersion: string | null;
  previousVersion: string | null;
  currentJobId: string | null;
  previousJobId: string | null;
  currentImageId: string | null;
  previousImageId: string | null;
  updatedAt: string | null;
};

export type DeploymentOverview = {
  state: DeploymentState;
  current: DeploymentJob | null;
  previous: DeploymentJob | null;
  active: DeploymentJob | null;
  history: DeploymentJob[];
  scan: DeploymentScan;
};
