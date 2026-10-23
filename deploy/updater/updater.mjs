#!/usr/bin/env node
/**
 * LearnOS single-host updater.
 *
 * The web process only creates persistent jobs. This container is the only
 * component allowed to touch Docker; it performs a fixed sequence of
 * operations, never a user-supplied command:
 *
 *   claim job -> fixed source snapshot -> validate/build tools image
 *   -> compose build web -> saved old image -> preflight compatibility
 *   -> courses:sync -> compose up web -> health check -> promote
 *
 * On a post-switch failure it restores the previous image. All progress and
 * logs are persisted in Supabase, so restarting the web container does not
 * lose the task.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const env = process.env;

const PROJECT_DIR = env.LEARNOS_PROJECT_DIR || "/workspace";
const COMPOSE_FILE = env.LEARNOS_COMPOSE_FILE || path.join(PROJECT_DIR, "docker-compose.yml");
const ENV_FILE = env.LEARNOS_ENV_FILE || path.join(PROJECT_DIR, ".env.local");
const DEPLOYMENTS_DIR = env.LEARNOS_DEPLOYMENTS_DIR || path.join(PROJECT_DIR, ".deployments");
// Must not be a child of PROJECT_DIR: Node refuses to copy a directory into
// itself. The updater's own filesystem is enough because jobs/logs live in
// Supabase and the build only needs the snapshot for the current run.
const SNAPSHOT_DIR =
  env.LEARNOS_SNAPSHOT_DIR || path.join(os.tmpdir(), "learnos-snapshots");
const SUPABASE_URL = (env.LEARNOS_SUPABASE_URL || env.SUPABASE_INTERNAL_URL || "").replace(
  /\/$/,
  "",
);
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";
const IMAGE_NAME = env.LEARNOS_IMAGE_NAME || "learnos-web";
const IMAGE_TAG = env.LEARNOS_IMAGE_TAG || "current";
const TOOLS_IMAGE = env.LEARNOS_TOOLS_IMAGE || "learnos-tools";
const WEB_SERVICE = env.LEARNOS_WEB_SERVICE || "web";
const WEB_CONTAINER = env.LEARNOS_WEB_CONTAINER || "learnos-web";
const HEALTH_URL = env.LEARNOS_HEALTH_URL || "http://web:3000/api/health";
const INTERNAL_SUPABASE_URL =
  env.SUPABASE_INTERNAL_URL || "http://host.docker.internal:54321";
const POLL_MS = Number(env.LEARNOS_POLL_MS || 2500);
const HEALTH_TIMEOUT_MS = Number(env.LEARNOS_HEALTH_TIMEOUT_MS || 180_000);
const BUILD_TIMEOUT_MS = Number(env.LEARNOS_BUILD_TIMEOUT_MS || 1_800_000);
const SYNC_TIMEOUT_MS = Number(env.LEARNOS_SYNC_TIMEOUT_MS || 300_000);
const ACTIVE_STATUSES = [
  "validating",
  "building",
  "syncing",
  "switching",
  "health_check",
  "rolling_back",
];
const EXCLUDED_NAMES = new Set([
  "node_modules",
  ".next",
  ".git",
  ".deployments",
  "playwright-report",
  "test-results",
  ".pwlibs",
  ".perf",
  "coverage",
  "docs",
  "supabase",
  "tests",
]);
const REST = `${SUPABASE_URL}/rest/v1`;
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

function log(...args) {
  console.log(`[updater ${new Date().toISOString()}]`, ...args);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEnvFile(name) {
  return name === ".env" || name === ".env.local" || /^\.env\..*\.local$/.test(name);
}

async function rest(pathname, init = {}) {
  const response = await fetch(`${REST}${pathname}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${response.status}: ${text.slice(0, 800)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function rpc(name, args = {}) {
  return rest(`/rpc/${name}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

async function patchJob(id, patch) {
  await rest(`/deployment_jobs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
}

async function getJob(id) {
  const rows = await rest(
    `/deployment_jobs?id=eq.${encodeURIComponent(id)}&select=*`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function countRows(pathname) {
  const response = await fetch(`${REST}${pathname}`, {
    method: "HEAD",
    headers: {
      ...HEADERS,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  if (!response.ok) throw new Error(`Supabase count ${response.status}`);
  const contentRange = response.headers.get("content-range");
  if (!contentRange) {
    // Some proxies strip Content-Range; fall back to a bounded row read.
    const rows = await rest(pathname);
    return Array.isArray(rows) ? rows.length : 0;
  }
  const total = contentRange.split("/")[1];
  return Number(total) || 0;
}

class JobLogger {
  constructor(jobId) {
    this.jobId = jobId;
    this.queue = [];
    this.flushing = null;
    this.timer = setInterval(() => {
      void this.flush();
    }, 600);
  }

  add(level, message) {
    const text = String(message ?? "").replace(/\r/g, "");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      this.queue.push({ level, message: line.slice(0, 8000) });
    }
    if (this.queue.length > 3000) this.queue = this.queue.slice(-3000);
  }

  async flush() {
    if (this.flushing) {
      await this.flushing;
      if (this.queue.length === 0) return;
    }
    const batch = this.queue.splice(0, 120);
    if (batch.length === 0) return;
    this.flushing = (async () => {
      try {
        await Promise.all(
          batch.map((line) =>
            rpc("append_deployment_log", {
              p_job: this.jobId,
              p_level: line.level,
              p_message: line.message,
            }),
          ),
        );
      } catch (error) {
        log("无法写入部署日志", error instanceof Error ? error.message : error);
      }
    })();
    await this.flushing;
    this.flushing = null;
    if (this.queue.length > 0) await this.flush();
  }

  async close() {
    clearInterval(this.timer);
    await this.flush();
  }
}

function runStreamed(command, args, options = {}) {
  const {
    logger,
    cwd = PROJECT_DIR,
    timeoutMs = BUILD_TIMEOUT_MS,
    extraEnv = {},
    allowFailure = false,
    captureStdout = false,
  } = options;

  return new Promise((resolve, reject) => {
    log(`$ ${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let stdout = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      logger?.add("error", `命令超时（${Math.round(timeoutMs / 1000)} 秒）`);
    }, timeoutMs);

    const consume = (chunk, level) => {
      const text = chunk.toString();
      output = (output + text).slice(-500_000);
      if (!(captureStdout && level === "info")) logger?.add(level, text);
    };
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-2_000_000);
      consume(chunk, "info");
    });
    child.stderr.on("data", (chunk) => consume(chunk, "error"));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command} 超时`));
      } else if (code === 0 || allowFailure) {
        resolve(captureStdout ? stdout : output);
      } else {
        reject(
          new Error(
            `${command} ${args.slice(0, 3).join(" ")} 退出码 ${code}\n${output.slice(-5000)}`,
          ),
        );
      }
    });
  });
}

async function dockerOutput(args, options = {}) {
  return runStreamed("docker", args, {
    ...options,
    timeoutMs: options.timeoutMs ?? 60_000,
    allowFailure: false,
  });
}

async function imageId(reference) {
  const output = await dockerOutput([
    "image",
    "inspect",
    "--format",
    "{{.Id}}",
    reference,
  ]);
  return output.trim();
}

async function currentWebImageId() {
  try {
    const output = await dockerOutput([
      "inspect",
      "--format",
      "{{.Image}}",
      WEB_CONTAINER,
    ]);
    const id = output.trim();
    if (id) return id;
  } catch {
    // No container yet; fall back to the image tag.
  }
  try {
    return await imageId(`${IMAGE_NAME}:${IMAGE_TAG}`);
  } catch {
    return null;
  }
}

async function dockerTag(from, to) {
  await dockerOutput(["tag", from, to]);
}

/**
 * Compose runs inside this container, but bind-mount sources are resolved by
 * the host Docker daemon. Ask Docker for the host path of our own /workspace
 * mount; relative `.:/workspace` would otherwise resolve to /workspace on the
 * host and create empty directories.
 */
async function detectHostProjectDir() {
  const container = os.hostname();
  const output = await dockerOutput([
    "inspect",
    "--format",
    '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{.Source}}{{"\\n"}}{{end}}{{end}}',
    container,
  ]);
  const source = output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)[0];
  if (!source) {
    throw new Error(
      "无法从 updater 容器的 /workspace 挂载推断宿主机项目路径；请确认 compose 挂载了 .:/workspace",
    );
  }
  return source;
}

function composeArgs(...args) {
  return [
    "compose",
    "--project-directory",
    PROJECT_DIR,
    "-f",
    COMPOSE_FILE,
    "--env-file",
    ENV_FILE,
    ...args,
  ];
}

function snapshotFilter(source) {
  const relative = path.relative(PROJECT_DIR, source);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  // Only exclude top-level build/scratch directories. `lib/supabase` and
  // nested `node_modules` are application code and must stay in the context.
  if (EXCLUDED_NAMES.has(parts[0])) return false;
  const name = parts[parts.length - 1];
  if (isEnvFile(name)) return false;
  if (name.endsWith(".tsbuildinfo")) return false;
  if (name === "next-env.d.ts") return false;
  return true;
}

function createSnapshot(job) {
  fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const target = path.join(
    SNAPSHOT_DIR,
    `${job.deployment_version}-${String(job.id).slice(0, 8)}`,
  );
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(PROJECT_DIR, target, {
    recursive: true,
    verbatimSymlinks: true,
    filter: snapshotFilter,
  });
  return target;
}

function pruneSnapshots(keep = 3) {
  try {
    if (!fs.existsSync(SNAPSHOT_DIR)) return;
    const entries = fs
      .readdirSync(SNAPSHOT_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(SNAPSHOT_DIR, entry.name))
      .sort(
        (a, b) =>
          fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs ||
          b.localeCompare(a),
      );
    for (const entry of entries.slice(keep)) {
      fs.rmSync(entry, { recursive: true, force: true });
    }
  } catch (error) {
    log("清理快照失败", error instanceof Error ? error.message : error);
  }
}

async function runTools(toolsImage, args, logger, options = {}) {
  return runStreamed(
    "docker",
    [
      "run",
      "--rm",
      "--add-host",
      "host.docker.internal:host-gateway",
      "--env-file",
      ENV_FILE,
      "-e",
      `SUPABASE_INTERNAL_URL=${INTERNAL_SUPABASE_URL}`,
      "-e",
      "PNPM_NO_UPDATE_NOTIFIER=1",
      toolsImage,
      ...args,
    ],
    {
      logger,
      timeoutMs: options.timeoutMs ?? SYNC_TIMEOUT_MS,
      captureStdout: options.captureStdout,
    },
  );
}

async function waitForHealth(expectedVersion, expectedImageId, logger) {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let attempts = 0;
  while (Date.now() < deadline) {
    attempts += 1;
    try {
      const response = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        const version = payload?.data?.version;
        const image = await currentWebImageId();
        const versionOk = !expectedVersion || version === expectedVersion;
        const imageOk = !expectedImageId || image === expectedImageId;
        if (versionOk && imageOk) {
          logger.add(
            "info",
            `健康检查通过：version=${version ?? "unknown"} image=${String(image ?? "").slice(0, 12)}`,
          );
          return;
        }
        if (attempts % 8 === 0) {
          logger.add(
            "warn",
            `健康检查等待中：version=${version ?? "unknown"} image=${String(image ?? "").slice(0, 12)}`,
          );
        }
      }
    } catch {
      // Container is starting or being replaced.
    }
    await sleep(2000);
  }
  throw new Error(`健康检查超时（${Math.round(HEALTH_TIMEOUT_MS / 1000)} 秒）`);
}

async function readCourseSnapshot(toolsImage, logger) {
  // Capture JSON on stdout. A bind mount would need the *host* project path,
  // which is not known inside the updater container; stdout keeps this working
  // with a relative `.:/workspace` mount.
  const output = await runTools(
    toolsImage,
    ["node_modules/.bin/tsx", "scripts/courses/snapshot-cli.ts"],
    logger,
    { timeoutMs: BUILD_TIMEOUT_MS, captureStdout: true },
  );
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("课程快照没有返回 JSON");
  }
  return JSON.parse(output.slice(start, end + 1));
}

async function pruneWebImages(keepIds) {
  try {
    const output = await dockerOutput([
      "images",
      IMAGE_NAME,
      "--no-trunc",
      "--format",
      "{{.ID}}",
    ]);
    const ids = [...new Set(output.split("\n").map((line) => line.trim()).filter(Boolean))];
    for (const id of ids) {
      if (keepIds.some((keep) => keep === id || `sha256:${id}` === keep || `sha256:${keep}` === id)) {
        continue;
      }
      try {
        // `-f` removes every tag pointing at a non-kept image. Plain `rm`
        // fails when an old image has several rollback-* tags.
        await dockerOutput(["image", "rm", "-f", id]);
      } catch (error) {
        log(`无法删除镜像 ${id.slice(0, 12)}`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    log("清理旧镜像失败", error instanceof Error ? error.message : error);
  }
}

async function runDeploy(job) {
  const logger = new JobLogger(job.id);
  const version = job.deployment_version;
  const toolsImage = `${TOOLS_IMAGE}:${version}`;
  let oldImageId = null;
  let newImageId = null;
  let promoted = false;
  let stage = "snapshot";
  const heartbeat = setInterval(() => {
    void patchJob(job.id, { heartbeat_at: new Date().toISOString() }).catch(() => {});
  }, 30_000);

  try {
    oldImageId = await currentWebImageId();
    if (oldImageId) {
      await dockerTag(oldImageId, `${IMAGE_NAME}:rollback-${job.id}`);
    }
    await patchJob(job.id, {
      status: "validating",
      phase: "正在校验",
      previous_image_id: oldImageId,
      heartbeat_at: new Date().toISOString(),
    });
    logger.add("info", `部署版本 ${version}；旧镜像 ${oldImageId ?? "无"}`);
    logger.add("info", "创建固定源码快照（构建期间课程文件变化不会进入镜像）");

    const snapshot = createSnapshot(job);
    logger.add("info", `快照目录：${snapshot}`);
    stage = "validate";
    await runStreamed(
      "docker",
      [
        "build",
        "--target",
        "tools",
        "-t",
        toolsImage,
        "-f",
        path.join(snapshot, "Dockerfile"),
        snapshot,
      ],
      { logger, timeoutMs: BUILD_TIMEOUT_MS },
    );
    logger.add("info", "课程 prepare/validate 通过");

    stage = "build";
    await patchJob(job.id, {
      status: "building",
      phase: "正在构建 Docker 镜像",
      heartbeat_at: new Date().toISOString(),
    });
    const buildTime = new Date().toISOString();
    await runStreamed(
      "docker",
      composeArgs("build", WEB_SERVICE),
      {
        logger,
        timeoutMs: BUILD_TIMEOUT_MS,
        extraEnv: {
          LEARNOS_BUILD_CONTEXT: snapshot,
          LEARNOS_IMAGE_TAG: IMAGE_TAG,
          LEARNOS_BUILD_VERSION: version,
          LEARNOS_BUILD_TIME: buildTime,
        },
      },
    );
    newImageId = await imageId(`${IMAGE_NAME}:${IMAGE_TAG}`);
    await dockerTag(`${IMAGE_NAME}:${IMAGE_TAG}`, `${IMAGE_NAME}:${version}`);
    await patchJob(job.id, {
      image_id: newImageId,
      image_tag: `${IMAGE_NAME}:${version}`,
      heartbeat_at: new Date().toISOString(),
    });
    logger.add("info", `新镜像：${newImageId} (${IMAGE_NAME}:${version})`);

    stage = "snapshot";
    await patchJob(job.id, {
      phase: "正在读取固定课程快照",
      heartbeat_at: new Date().toISOString(),
    });
    const snapshotPayload = await readCourseSnapshot(toolsImage, logger);
    if (!Array.isArray(snapshotPayload.courses) || snapshotPayload.failures?.length > 0) {
      throw new Error(
        `课程快照失败：${(snapshotPayload.failures ?? [])
          .map((failure) => `${failure.slug}: ${failure.error}`)
          .join("；")}`,
      );
    }
    await patchJob(job.id, {
      courses: snapshotPayload.courses,
      heartbeat_at: new Date().toISOString(),
    });

    stage = "preflight";
    await patchJob(job.id, {
      status: "syncing",
      phase: "正在检查课程数据兼容性",
      heartbeat_at: new Date().toISOString(),
    });
    await runTools(toolsImage, ["pnpm", "courses:preflight"], logger);

    stage = "sync";
    await patchJob(job.id, {
      phase: "正在同步课程数据",
      heartbeat_at: new Date().toISOString(),
    });
    await runTools(toolsImage, ["pnpm", "courses:sync", "--publish-new"], logger);

    stage = "switch";
    await patchJob(job.id, {
      status: "switching",
      phase: "正在更新容器",
      heartbeat_at: new Date().toISOString(),
    });
    await runStreamed(
      "docker",
      composeArgs("up", "-d", "--no-deps", "--force-recreate", WEB_SERVICE),
      {
        logger,
        timeoutMs: SYNC_TIMEOUT_MS,
        extraEnv: {
          LEARNOS_IMAGE_TAG: IMAGE_TAG,
          LEARNOS_BUILD_VERSION: version,
          LEARNOS_BUILD_TIME: buildTime,
        },
      },
    );

    stage = "health";
    await patchJob(job.id, {
      status: "health_check",
      phase: "正在检查服务",
      heartbeat_at: new Date().toISOString(),
    });
    await waitForHealth(version, newImageId, logger);

    await logger.flush();
    await rpc("promote_deployment", {
      p_job: job.id,
      p_image_id: newImageId,
      p_image_tag: `${IMAGE_NAME}:${version}`,
      p_result: {
        health: "ok",
        previousImageId: oldImageId,
        buildTime,
        finishedAt: new Date().toISOString(),
      },
    });
    promoted = true;
    logger.add("info", "部署成功，当前版本已更新");
    await logger.close();
    await pruneWebImages([newImageId, oldImageId].filter(Boolean));
    pruneSnapshots();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (promoted) {
      // Promote already happened; never turn a successful release into a
      // failure just because best-effort cleanup failed.
      log("部署已成功后发生非致命错误", message);
      await logger.close();
      return;
    }
    logger.add("error", `部署失败（${stage}）：${message}`);
    await logger.flush();
    switch (stage) {
      case "snapshot":
      case "validate":
      case "build":
      case "preflight":
      case "sync":
        // The build moved the `current` tag to the new image before the
        // container switch. Point it back at the old image so a manual
        // `docker compose up` cannot start an unverified build.
        if (oldImageId && newImageId) {
          try {
            await dockerTag(oldImageId, `${IMAGE_NAME}:${IMAGE_TAG}`);
          } catch (tagError) {
            logger.add(
              "error",
              `无法恢复 current 标签：${tagError instanceof Error ? tagError.message : tagError}`,
            );
          }
        }
        await rpc("finish_deployment_failure", {
          p_job: job.id,
          p_status: "failed",
          p_error: message,
          p_result: { stage },
        });
        break;
      default: {
        try {
          if (!oldImageId) throw new Error("没有可恢复的旧镜像引用");
          await patchJob(job.id, {
            status: "rolling_back",
            phase: "部署失败，正在恢复上一镜像",
            heartbeat_at: new Date().toISOString(),
          });
          logger.add("warn", `恢复旧镜像 ${oldImageId}`);
          await dockerTag(oldImageId, `${IMAGE_NAME}:${IMAGE_TAG}`);
          await runStreamed(
            "docker",
            composeArgs("up", "-d", "--no-deps", "--force-recreate", WEB_SERVICE),
            {
              logger,
              timeoutMs: SYNC_TIMEOUT_MS,
              extraEnv: { LEARNOS_IMAGE_TAG: IMAGE_TAG },
            },
          );
          await waitForHealth(null, oldImageId, logger);
          await logger.flush();
          await rpc("finish_deployment_failure", {
            p_job: job.id,
            p_status: "rolled_back",
            p_error: message,
            p_result: { stage, autoRollback: "ok", previousImageId: oldImageId },
          });
          logger.add("info", "已自动恢复上一镜像");
        } catch (rollbackError) {
          const rollbackMessage =
            rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
          logger.add("error", `自动回滚失败：${rollbackMessage}`);
          await logger.flush();
          await rpc("finish_deployment_failure", {
            p_job: job.id,
            p_status: "failed",
            p_error: `${message}；自动回滚失败：${rollbackMessage}`,
            p_result: { stage, autoRollback: "failed" },
          });
        }
        break;
      }
    }
    await logger.close();
    pruneSnapshots();
    if (stage === "health" || stage === "switch") {
      await pruneWebImages([oldImageId].filter(Boolean));
    }
  } finally {
    clearInterval(heartbeat);
    await logger.close();
  }
}

export function structureMatchesSnapshot(course, rows) {
  if (!Array.isArray(rows) || rows.length !== course.lessons.length) return false;
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  return course.lessons.every((lesson, index) => {
    const row = sorted[index];
    if (!row) return false;
    if (
      row.slug !== lesson.slug ||
      row.position !== lesson.position ||
      row.required !== lesson.required ||
      row.type !== lesson.type ||
      row.completion_policy !== lesson.completionPolicy
    ) {
      return false;
    }
    const config = row.config ?? {};
    if (lesson.type === "quiz") {
      if (Number(config.passScore) !== lesson.passScore) return false;
      if (Boolean(config.finalExam) !== Boolean(lesson.finalExam)) return false;
      if (config.quizHash !== lesson.quizHash) return false;
    }
    if (lesson.type === "interactive") {
      if (config.activityId !== lesson.activityId) return false;
      if (config.validatorId !== lesson.validatorId) return false;
      if (
        config.validatorFingerprintVersion === 2 &&
        config.validatorFingerprint !== lesson.validatorFingerprint
      ) {
        return false;
      }
    }
    return true;
  });
}

async function checkRollbackSafety(targetJob) {
  const targetCourses = Array.isArray(targetJob.courses) ? targetJob.courses : [];
  const targetBySlug = new Map(targetCourses.map((course) => [course.slug, course]));

  for (const course of targetCourses) {
    const rows = await rest(`/courses?slug=eq.${encodeURIComponent(course.slug)}&select=id,slug`);
    const dbCourse = Array.isArray(rows) ? rows[0] : null;
    if (!dbCourse) continue;

    const enrollments = await countRows(
      `/enrollments?course_id=eq.${encodeURIComponent(dbCourse.id)}&select=id`,
    );
    if (enrollments === 0) continue;

    const lessons = await rest(
      `/lessons?course_id=eq.${encodeURIComponent(dbCourse.id)}&select=slug,position,required,type,completion_policy,config&order=position.asc`,
    );
    if (!structureMatchesSnapshot(course, lessons)) {
      throw new Error(
        `课程 ${course.slug} 已有 ${enrollments} 条学习记录，但数据库结构与该回滚版本不一致`,
      );
    }
  }

  const dbCourses = await rest("/courses?select=id,slug");
  for (const dbCourse of Array.isArray(dbCourses) ? dbCourses : []) {
    if (targetBySlug.has(dbCourse.slug)) continue;
    const enrollments = await countRows(
      `/enrollments?course_id=eq.${encodeURIComponent(dbCourse.id)}&select=id`,
    );
    if (enrollments > 0) {
      throw new Error(
        `课程 ${dbCourse.slug} 已有 ${enrollments} 条学习记录，但目标版本不包含该课程`,
      );
    }
  }
}

async function runRollback(job) {
  const logger = new JobLogger(job.id);
  const target = job.rollback_target_job_id ? await getJob(job.rollback_target_job_id) : null;
  let currentImageId = null;
  let switched = false;
  let promoted = false;
  let stage = "validate";

  try {
    if (!target || target.status !== "succeeded") {
      throw new Error("回滚目标不是成功的部署记录");
    }
    if (!target.image_id && !target.image_tag) {
      throw new Error("回滚目标缺少镜像引用");
    }
    const targetImageId = target.image_id || (await imageId(target.image_tag));
    if (!targetImageId) throw new Error("回滚目标镜像不存在");

    await patchJob(job.id, {
      status: "validating",
      phase: "正在检查回滚兼容性",
      image_id: targetImageId,
      image_tag: target.image_tag ?? `${IMAGE_NAME}:${target.deployment_version}`,
      heartbeat_at: new Date().toISOString(),
    });
    logger.add("info", `准备回滚到 ${target.deployment_version} (${targetImageId.slice(0, 12)})`);
    await checkRollbackSafety(target);
    logger.add("info", "课程结构与学习记录兼容，允许回滚");

    currentImageId = await currentWebImageId();
    if (currentImageId) {
      await dockerTag(currentImageId, `${IMAGE_NAME}:rollback-${job.id}`);
    }

    stage = "switch";
    await patchJob(job.id, {
      status: "switching",
      phase: "正在恢复上一个镜像",
      heartbeat_at: new Date().toISOString(),
    });
    await dockerTag(targetImageId, `${IMAGE_NAME}:${IMAGE_TAG}`);
    await runStreamed(
      "docker",
      composeArgs("up", "-d", "--no-deps", "--force-recreate", WEB_SERVICE),
      {
        logger,
        timeoutMs: SYNC_TIMEOUT_MS,
        extraEnv: { LEARNOS_IMAGE_TAG: IMAGE_TAG },
      },
    );
    switched = true;

    stage = "health";
    await patchJob(job.id, {
      status: "health_check",
      phase: "正在检查服务",
      heartbeat_at: new Date().toISOString(),
    });
    await waitForHealth(target.deployment_version, targetImageId, logger);

    await logger.flush();
    await rpc("promote_rollback", {
      p_job: job.id,
      p_target_job: target.id,
      p_image_id: targetImageId,
      p_image_tag: target.image_tag ?? `${IMAGE_NAME}:${target.deployment_version}`,
      p_result: {
        health: "ok",
        targetVersion: target.deployment_version,
        previousImageId: currentImageId,
      },
    });
    promoted = true;
    logger.add("info", "回滚成功");
    await logger.close();
    await pruneWebImages([targetImageId, currentImageId].filter(Boolean));
    pruneSnapshots();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (promoted) {
      log("回滚已成功后发生非致命错误", message);
      await logger.close();
      return;
    }
    logger.add("error", `回滚失败（${stage}）：${message}`);
    if (switched && currentImageId) {
      try {
        await patchJob(job.id, {
          status: "rolling_back",
          phase: "回滚失败，正在恢复原镜像",
          heartbeat_at: new Date().toISOString(),
        });
        logger.add("warn", `恢复原镜像 ${currentImageId}`);
        await dockerTag(currentImageId, `${IMAGE_NAME}:${IMAGE_TAG}`);
        await runStreamed(
          "docker",
          composeArgs("up", "-d", "--no-deps", "--force-recreate", WEB_SERVICE),
          {
            logger,
            timeoutMs: SYNC_TIMEOUT_MS,
            extraEnv: { LEARNOS_IMAGE_TAG: IMAGE_TAG },
          },
        );
        await waitForHealth(null, currentImageId, logger);
      } catch (restoreError) {
        logger.add(
          "error",
          `恢复原镜像失败：${restoreError instanceof Error ? restoreError.message : restoreError}`,
        );
      }
    }
    await logger.flush();
    await rpc("finish_deployment_failure", {
      p_job: job.id,
      p_status: "failed",
      p_error: message,
      p_result: { stage, rollback: "failed" },
    });
    await logger.close();
    pruneSnapshots();
  } finally {
    await logger.close();
  }
}

async function recoverStaleJobs() {
  const rows = await rest(
    `/deployment_jobs?status=in.(${ACTIVE_STATUSES.join(",")})&select=id,status,deployment_version`,
  );
  for (const row of Array.isArray(rows) ? rows : []) {
    try {
      await rpc("append_deployment_log", {
        p_job: row.id,
        p_level: "error",
        p_message: `更新程序重启，任务 ${row.status} 中断；请检查 docker compose ps 后重新部署或回滚。`,
      });
      await rpc("finish_deployment_failure", {
        p_job: row.id,
        p_status: "failed",
        p_error: "更新程序重启，任务中断；容器状态可能已部分变化，请人工确认。",
        p_result: { interruptedAt: new Date().toISOString() },
      });
      log(`已将中断任务 ${row.id} 标记为失败`);
    } catch (error) {
      log("恢复中断任务失败", error instanceof Error ? error.message : error);
    }
  }
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error("缺少 LEARNOS_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!fs.existsSync(COMPOSE_FILE)) {
    throw new Error(`找不到 compose 文件: ${COMPOSE_FILE}`);
  }
  if (!fs.existsSync(ENV_FILE)) {
    throw new Error(`找不到环境文件: ${ENV_FILE}`);
  }
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });

  const hostProjectDir = await detectHostProjectDir();
  process.env.LEARNOS_HOST_PROJECT_DIR = hostProjectDir;
  log(`updater 启动；宿主机项目路径 ${hostProjectDir}`);
  await recoverStaleJobs();

  while (true) {
    try {
      const claimed = await rpc("claim_deployment_job");
      const job = Array.isArray(claimed) ? claimed[0] : claimed;
      if (job) {
        log(`领取任务 ${job.id} (${job.kind} ${job.deployment_version})`);
        if (job.kind === "rollback") await runRollback(job);
        else await runDeploy(job);
      }
    } catch (error) {
      log("轮询/执行失败", error instanceof Error ? error.message : error);
    }
    await sleep(POLL_MS);
  }
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error("[updater] 致命错误", error);
    process.exit(1);
  });
}
