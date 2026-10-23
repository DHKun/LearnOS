import { ApiError } from "@/lib/api/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { compareScan, scanLocalCourses } from "@/lib/deployments/scan";
import type {
  DeploymentCourseSnapshot,
  DeploymentJob,
  DeploymentJobStatus,
  DeploymentLogLine,
  DeploymentOverview,
  DeploymentScan,
  DeploymentState,
  ScannedCourse,
} from "@/lib/deployments/types";

const ACTIVE_STATUSES: DeploymentJobStatus[] = [
  "queued",
  "validating",
  "building",
  "syncing",
  "switching",
  "health_check",
  "rolling_back",
];

type JobRow = {
  id: string;
  kind: "deploy" | "rollback";
  status: DeploymentJobStatus;
  phase: string | null;
  deployment_version: string;
  image_tag: string | null;
  image_id: string | null;
  previous_version: string | null;
  previous_image_id: string | null;
  rollback_target_job_id: string | null;
  requested_by: string | null;
  courses: DeploymentCourseSnapshot[] | null;
  result: Record<string, unknown> | null;
  logs: DeploymentLogLine[] | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  heartbeat_at: string | null;
};

function readJob(row: JobRow, detail = true): DeploymentJob {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    phase: row.phase,
    deploymentVersion: row.deployment_version,
    imageTag: row.image_tag,
    imageId: row.image_id,
    previousVersion: row.previous_version,
    previousImageId: row.previous_image_id,
    rollbackTargetJobId: row.rollback_target_job_id,
    requestedBy: row.requested_by,
    courses: detail ? row.courses ?? [] : [],
    result: row.result ?? {},
    logs: detail ? row.logs ?? [] : [],
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    heartbeatAt: row.heartbeat_at,
  };
}

/** Next `YYYY.MM.DD-NN` system version, based on every job ever created. */
export function nextDeploymentVersion(versions: string[], now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", ".");
  const prefix = `${day}-`;
  let maximum = 0;
  for (const version of versions) {
    if (!version.startsWith(prefix)) continue;
    const sequence = Number(version.slice(prefix.length));
    if (Number.isFinite(sequence)) maximum = Math.max(maximum, sequence);
  }
  if (maximum >= 99) {
    throw new ApiError("CONFLICT", "今天的部署版本号已用尽（最多 99 次）");
  }
  return `${prefix}${String(maximum + 1).padStart(2, "0")}`;
}

function emptyState(): DeploymentState {
  return {
    currentVersion: null,
    previousVersion: null,
    currentJobId: null,
    previousJobId: null,
    currentImageId: null,
    previousImageId: null,
    updatedAt: null,
  };
}

export async function getDeploymentState(): Promise<DeploymentState> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("deployment_state")
    .select(
      "current_job_id,previous_job_id,current_version,previous_version,current_image_id,previous_image_id,updated_at",
    )
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return emptyState();
  return {
    currentVersion: data.current_version,
    previousVersion: data.previous_version,
    currentJobId: data.current_job_id,
    previousJobId: data.previous_job_id,
    currentImageId: data.current_image_id,
    previousImageId: data.previous_image_id,
    updatedAt: data.updated_at,
  };
}

async function getJobRow(id: string): Promise<JobRow | null> {
  const db = createAdminClient();
  const { data, error } = await db.from("deployment_jobs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data as JobRow | null) ?? null;
}

export async function getDeploymentJob(id: string): Promise<DeploymentJob> {
  const row = await getJobRow(id);
  if (!row) throw new ApiError("DEPLOYMENT_JOB_NOT_FOUND");
  return readJob(row);
}

async function latestSucceededJob(): Promise<JobRow | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("deployment_jobs")
    .select("*")
    .eq("status", "succeeded")
    .order("finished_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as JobRow | null) ?? null;
}

async function getEnrollmentCounts(): Promise<Map<string, number>> {
  const db = createAdminClient();
  const [{ data: courses, error: courseError }, { data: enrollments, error: enrollmentError }] =
    await Promise.all([
      db.from("courses").select("id,slug"),
      db.from("enrollments").select("course_id"),
    ]);
  if (courseError) throw courseError;
  if (enrollmentError) throw enrollmentError;

  const slugById = new Map((courses ?? []).map((course) => [course.id, course.slug]));
  const counts = new Map<string, number>();
  for (const enrollment of enrollments ?? []) {
    const slug = slugById.get(enrollment.course_id);
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}

export async function scanDeploymentCourses(): Promise<DeploymentScan> {
  const state = await getDeploymentState();
  const current = state.currentJobId ? await getJobRow(state.currentJobId) : null;
  const baselineRow = current ?? (await latestSucceededJob());
  const baseline = (baselineRow?.courses ?? []) as DeploymentCourseSnapshot[];
  const { courses, failures } = scanLocalCourses();
  const enrollmentCounts = await getEnrollmentCounts();

  return compareScan({
    courses,
    failures,
    baseline,
    baselineVersion: baselineRow?.deployment_version ?? null,
    baselineDeploymentId: baselineRow?.id ?? null,
    enrollmentCounts,
  });
}

function toSnapshot(item: ScannedCourse): DeploymentCourseSnapshot {
  const {
    status: _status,
    enrollments: _enrollments,
    previousVersion: _previousVersion,
    messages: _messages,
    warnings: _warnings,
    changes: _changes,
    ...snapshot
  } = item;
  return snapshot;
}

export async function createDeploymentJob(requestedBy: string): Promise<DeploymentJob> {
  const db = createAdminClient();
  const state = await getDeploymentState();

  const { data: active, error: activeError } = await db
    .from("deployment_jobs")
    .select("id")
    .in("status", ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (active) throw new ApiError("DEPLOYMENT_IN_PROGRESS");

  const scan = await scanDeploymentCourses();
  if (!scan.canDeploy) {
    throw new ApiError(
      "DEPLOYMENT_CONFLICT",
      `扫描发现阻塞项：${scan.blockingReasons.slice(0, 3).join("；")}`,
    );
  }

  const { data: versions, error: versionError } = await db
    .from("deployment_jobs")
    .select("deployment_version");
  if (versionError) throw versionError;
  const version = nextDeploymentVersion((versions ?? []).map((row) => row.deployment_version));

  const courses = scan.items
    .filter((item) => item.status !== "removed")
    .map((item) => toSnapshot(item));

  const { data: inserted, error } = await db
    .from("deployment_jobs")
    .insert({
      kind: "deploy",
      status: "queued",
      phase: "等待部署",
      deployment_version: version,
      previous_version: state.currentVersion,
      previous_image_id: state.currentImageId,
      requested_by: requestedBy,
      courses,
      result: { scanAt: scan.scannedAt, baselineVersion: scan.baselineVersion },
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new ApiError("DEPLOYMENT_IN_PROGRESS");
    throw error;
  }

  return readJob(inserted as JobRow);
}

export async function createRollbackJob(
  requestedBy: string,
  targetJobId?: string,
): Promise<DeploymentJob> {
  const db = createAdminClient();
  const state = await getDeploymentState();

  const { data: active, error: activeError } = await db
    .from("deployment_jobs")
    .select("id")
    .in("status", ACTIVE_STATUSES)
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (active) throw new ApiError("DEPLOYMENT_IN_PROGRESS");

  const targetId = targetJobId ?? state.previousJobId;
  if (!targetId) throw new ApiError("DEPLOYMENT_NOT_AVAILABLE");
  if (targetId === state.currentJobId) {
    throw new ApiError("DEPLOYMENT_NOT_AVAILABLE", "目标版本已经是当前版本");
  }

  const target = await getJobRow(targetId);
  if (!target || target.status !== "succeeded" || !target.image_tag) {
    throw new ApiError("DEPLOYMENT_NOT_AVAILABLE", "目标版本不是可用的成功部署记录");
  }

  const { data: inserted, error } = await db
    .from("deployment_jobs")
    .insert({
      kind: "rollback",
      status: "queued",
      phase: "等待回滚",
      deployment_version: target.deployment_version,
      image_tag: target.image_tag,
      image_id: target.image_id,
      previous_version: state.currentVersion,
      previous_image_id: state.currentImageId,
      rollback_target_job_id: target.id,
      requested_by: requestedBy,
      courses: target.courses ?? [],
      result: { targetVersion: target.deployment_version },
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new ApiError("DEPLOYMENT_IN_PROGRESS");
    throw error;
  }

  return readJob(inserted as JobRow);
}

export async function getDeploymentOverview(): Promise<DeploymentOverview> {
  const db = createAdminClient();
  const state = await getDeploymentState();

  const [current, previous, activeResult, historyResult, scan] = await Promise.all([
    state.currentJobId ? getJobRow(state.currentJobId) : Promise.resolve(null),
    state.previousJobId ? getJobRow(state.previousJobId) : Promise.resolve(null),
    db
      .from("deployment_jobs")
      .select("*")
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("deployment_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    scanDeploymentCourses(),
  ]);

  if (activeResult.error) throw activeResult.error;
  if (historyResult.error) throw historyResult.error;

  const activeJob = activeResult.data ? readJob(activeResult.data as JobRow) : null;

  return {
    state,
    current: current ? readJob(current) : null,
    previous: previous ? readJob(previous) : null,
    active: activeJob ? { ...activeJob, logs: activeJob.logs.slice(-500) } : null,
    history: ((historyResult.data ?? []) as JobRow[]).map((row) => readJob(row, false)),
    scan,
  };
}

/** Number of files that differ, for compact UI summaries. */
export function changeCount(changes: ScannedCourse["changes"]): number {
  return changes.added.length + changes.modified.length + changes.removed.length;
}
