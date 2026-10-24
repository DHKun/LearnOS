import { sql } from "drizzle-orm";

import { ApiError } from "@/lib/api/errors";
import { mapPgError, one, rows, textList } from "@/lib/db/query";
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
  const data = await one<{
    current_job_id: string | null;
    previous_job_id: string | null;
    current_version: string | null;
    previous_version: string | null;
    current_image_id: string | null;
    previous_image_id: string | null;
    updated_at: string | null;
  }>(sql`
    select current_job_id, previous_job_id, current_version, previous_version,
           current_image_id, previous_image_id, updated_at
    from public.deployment_state
    where id = true
    limit 1
  `);
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
  return one<JobRow>(sql`select * from public.deployment_jobs where id = ${id}::uuid limit 1`);
}

export async function getDeploymentJob(id: string): Promise<DeploymentJob> {
  const row = await getJobRow(id);
  if (!row) throw new ApiError("DEPLOYMENT_JOB_NOT_FOUND");
  return readJob(row);
}

async function latestSucceededJob(): Promise<JobRow | null> {
  return one<JobRow>(sql`
    select * from public.deployment_jobs
    where status = 'succeeded'
    order by finished_at desc
    limit 1
  `);
}

async function getEnrollmentCounts(): Promise<Map<string, number>> {
  const data = await rows<{ course_id: string; slug: string }>(sql`
    select e.course_id, c.slug
    from public.enrollments e
    join public.courses c on c.id = e.course_id
  `);
  const counts = new Map<string, number>();
  for (const enrollment of data) {
    counts.set(enrollment.slug, (counts.get(enrollment.slug) ?? 0) + 1);
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
  const state = await getDeploymentState();
  const active = await one<{ id: string }>(sql`
    select id from public.deployment_jobs
    where status = any(${textList(ACTIVE_STATUSES)})
    limit 1
  `);
  if (active) throw new ApiError("DEPLOYMENT_IN_PROGRESS");

  const scan = await scanDeploymentCourses();
  if (!scan.canDeploy) {
    throw new ApiError(
      "DEPLOYMENT_CONFLICT",
      `扫描发现阻塞项：${scan.blockingReasons.slice(0, 3).join("；")}`,
    );
  }

  const versions = await rows<{ deployment_version: string }>(sql`
    select deployment_version from public.deployment_jobs
  `);
  const version = nextDeploymentVersion(versions.map((row) => row.deployment_version));
  const courses = scan.items.filter((item) => item.status !== "removed").map(toSnapshot);

  try {
    const inserted = await one<JobRow>(sql`
      insert into public.deployment_jobs
        (kind, status, phase, deployment_version, previous_version, previous_image_id,
         requested_by, courses, result)
      values
        ('deploy', 'queued', '等待部署', ${version}, ${state.currentVersion},
         ${state.currentImageId}::uuid, ${requestedBy}, ${JSON.stringify(courses)}::jsonb,
         ${JSON.stringify({ scanAt: scan.scannedAt, baselineVersion: scan.baselineVersion })}::jsonb)
      returning *
    `);
    if (!inserted) throw new ApiError("INTERNAL_ERROR");
    return readJob(inserted);
  } catch (error) {
    return mapPgError(error);
  }
}

export async function createRollbackJob(
  requestedBy: string,
  targetJobId?: string,
): Promise<DeploymentJob> {
  const state = await getDeploymentState();
  const active = await one<{ id: string }>(sql`
    select id from public.deployment_jobs
    where status = any(${textList(ACTIVE_STATUSES)})
    limit 1
  `);
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

  try {
    const inserted = await one<JobRow>(sql`
      insert into public.deployment_jobs
        (kind, status, phase, deployment_version, image_tag, image_id,
         previous_version, previous_image_id, rollback_target_job_id,
         requested_by, courses, result)
      values
        ('rollback', 'queued', '等待回滚', ${target.deployment_version},
         ${target.image_tag}, ${target.image_id}::uuid, ${state.currentVersion},
         ${state.currentImageId}::uuid, ${target.id}::uuid, ${requestedBy},
         ${JSON.stringify(target.courses ?? [])}::jsonb,
         ${JSON.stringify({ targetVersion: target.deployment_version })}::jsonb)
      returning *
    `);
    if (!inserted) throw new ApiError("INTERNAL_ERROR");
    return readJob(inserted);
  } catch (error) {
    return mapPgError(error);
  }
}

export async function getDeploymentOverview(): Promise<DeploymentOverview> {
  const state = await getDeploymentState();

  const [current, previous, activeRow, historyRows, scan] = await Promise.all([
    state.currentJobId ? getJobRow(state.currentJobId) : Promise.resolve(null),
    state.previousJobId ? getJobRow(state.previousJobId) : Promise.resolve(null),
    one<JobRow>(sql`
      select * from public.deployment_jobs
      where status = any(${textList(ACTIVE_STATUSES)})
      order by created_at desc
      limit 1
    `),
    rows<JobRow>(sql`
      select * from public.deployment_jobs
      order by created_at desc
      limit 20
    `),
    scanDeploymentCourses(),
  ]);

  const activeJob = activeRow ? readJob(activeRow) : null;

  return {
    state,
    current: current ? readJob(current) : null,
    previous: previous ? readJob(previous) : null,
    active: activeJob ? { ...activeJob, logs: activeJob.logs.slice(-500) } : null,
    history: historyRows.map((row) => readJob(row, false)),
    scan,
  };
}

/** Number of files that differ, for compact UI summaries. */
export function changeCount(changes: ScannedCourse["changes"]): number {
  return changes.added.length + changes.modified.length + changes.removed.length;
}
