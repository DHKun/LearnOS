import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { ApiError, mapDatabaseError } from "@/lib/api/errors";
import { db } from "@/lib/db";
import { mapPgError, one, rows, rpc, uuidList } from "@/lib/db/query";
import { invalidateCourseCache } from "@/lib/services/courses";
import { isOnline } from "@/lib/services/shared";
import type {
  AdminAttention,
  AdminAttentionItem,
  AdminCourseStudentRow,
  AdminOverview,
  AdminStudentDetail,
  AdminStudentRow,
  CourseProgress,
  EnrollmentStatus,
  LessonProgressStatus,
  LessonType,
} from "@/lib/types";

type EnrollmentLite = {
  id: string;
  student_id: string;
  course_id: string;
  status: EnrollmentStatus;
  current_lesson_id: string | null;
  started_at: string;
  last_seen_at: string | null;
  last_interaction_at: string | null;
  completed_at: string | null;
};

type LessonLite = {
  id: string;
  course_id: string;
  title: string;
  type: LessonType;
  position: number;
  required: boolean;
  completion_policy: string;
  config: Record<string, unknown> | null;
};

function progressFor(
  enrollment: EnrollmentLite,
  lessons: LessonLite[],
  completed: Set<string>,
): CourseProgress {
  const required = lessons.filter(
    (lesson) => lesson.course_id === enrollment.course_id && lesson.required,
  );
  const done = required.filter((lesson) => completed.has(lesson.id)).length;
  return {
    total: required.length,
    completed: done,
    percent: required.length === 0 ? 0 : Math.round((done / required.length) * 100),
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  try {
    return await rpc<AdminOverview>("admin_overview");
  } catch (error) {
    return mapPgError(error);
  }
}

export async function listStudents(options: {
  q?: string;
  online?: boolean;
  courseId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AdminStudentRow[]; total: number; page: number; pageSize: number }> {
  try {
    return await rpc("admin_students_page", {
      p_q: options.q?.trim() || null,
      p_online: options.online ?? null,
      p_course: options.courseId ?? null,
      p_page: options.page,
      p_page_size: options.pageSize,
    });
  } catch (error) {
    return mapPgError(error);
  }
}

export async function getAdminAttention(): Promise<AdminAttention> {
  const raw = await rows<{
    student_id: string;
    course_id: string;
    status: string;
    current_lesson_id: string | null;
    started_at: string;
    last_interaction_at: string | null;
    completed_at: string | null;
    display_name: string;
    email: string | null;
    course_title: string;
    lessons: { id: string; title: string }[] | null;
    progress: { lesson_id: string; status: string }[] | null;
  }>(sql`
    select e.student_id, e.course_id, e.status, e.current_lesson_id,
           e.started_at::text, e.last_interaction_at::text, e.completed_at::text,
           p.display_name, p.email, c.title as course_title,
           coalesce(
             (select jsonb_agg(jsonb_build_object('id', l.id, 'title', l.title) order by l.position)
              from public.lessons l where l.course_id = c.id),
             '[]'::jsonb
           ) as lessons,
           coalesce(
             (select jsonb_agg(jsonb_build_object('lesson_id', lp.lesson_id, 'status', lp.status))
              from public.lesson_progress lp where lp.enrollment_id = e.id),
             '[]'::jsonb
           ) as progress
    from public.enrollments e
    join public.profiles p on p.user_id = e.student_id
    join public.courses c on c.id = e.course_id
    where e.status in ('active', 'completed')
  `);

  const now = Date.now();
  const days = (ms: number) => now - ms;
  const build = (row: (typeof raw)[number]): AdminAttentionItem => {
    const lessons = row.lessons ?? [];
    const completed = new Set(
      (row.progress ?? [])
        .filter((item) => item.status === "completed")
        .map((item) => item.lesson_id),
    );
    const required = lessons.length || 1;
    return {
      studentId: row.student_id,
      name: row.display_name ?? "未命名学生",
      courseId: row.course_id,
      courseTitle: row.course_title ?? "未知课程",
      currentLesson: lessons.find((lesson) => lesson.id === row.current_lesson_id)?.title ?? null,
      progress: Math.round((completed.size / required) * 100),
      lastInteractionAt: row.last_interaction_at,
      startedAt: row.started_at,
    };
  };

  const active = raw.filter((row) => row.status === "active");
  const notStarted = active
    .filter(
      (row) =>
        (row.progress ?? []).filter((item) => item.status === "completed").length === 0 &&
        !row.current_lesson_id &&
        !row.last_interaction_at,
    )
    .map(build);
  const inactive = active
    .filter((row) => {
      const reference = row.last_interaction_at ?? row.started_at;
      return new Date(reference).getTime() < days(3 * 24 * 60 * 60 * 1000);
    })
    .map(build);
  const stuck = active
    .filter((row) => {
      const item = build(row);
      return (
        Boolean(row.current_lesson_id) &&
        item.progress < 100 &&
        new Date(row.last_interaction_at ?? row.started_at).getTime() <
          days(2 * 24 * 60 * 60 * 1000)
      );
    })
    .map(build);
  const recentlyCompleted = raw
    .filter((row) => row.status === "completed")
    .filter(
      (row) =>
        row.completed_at &&
        new Date(row.completed_at).getTime() > days(7 * 24 * 60 * 60 * 1000),
    )
    .map(build);

  const limit = (items: AdminAttentionItem[]) => items.slice(0, 6);
  return {
    notStarted: limit(notStarted),
    inactive: limit(inactive),
    stuck: limit(stuck),
    recentlyCompleted: limit(recentlyCompleted),
  };
}

export async function getStudentDetail(studentId: string): Promise<AdminStudentDetail> {
  const profile = await one<{
    user_id: string;
    email: string | null;
    display_name: string;
    disabled_at: string | null;
    created_at: string;
    role: string;
  }>(sql`
    select user_id, email, display_name, disabled_at::text, created_at::text, role
    from public.profiles
    where user_id = ${studentId}::uuid and role = 'student'
    limit 1
  `);
  if (!profile) throw new ApiError("STUDENT_NOT_FOUND");

  const profileEvents = await rows<{
    id: string;
    delta: number;
    reason: string;
    created_at: string;
  }>(sql`
    select id, delta, reason, created_at::text
    from public.point_events
    where student_id = ${studentId}::uuid
    order by created_at desc
    limit 50
  `);

  const enrollments = await rows<EnrollmentLite>(sql`
    select id, student_id, course_id, status, current_lesson_id,
           started_at::text, last_seen_at::text, last_interaction_at::text, completed_at::text
    from public.enrollments
    where student_id = ${studentId}::uuid
    order by started_at desc
  `);

  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  const enrollmentIds = enrollments.map((row) => row.id);

  const [courses, lessons, progressRows, events, totalPoints] = await Promise.all([
    courseIds.length
      ? rows<{ id: string; title: string; slug: string }>(sql`
          select id, title, slug from public.courses where id = any(${uuidList(courseIds)})
        `)
      : Promise.resolve([]),
    courseIds.length
      ? rows<LessonLite>(sql`
          select id, course_id, title, type, position, required,
                 completion_policy, config
          from public.lessons where course_id = any(${uuidList(courseIds)})
        `)
      : Promise.resolve([]),
    enrollmentIds.length
      ? rows<{
          enrollment_id: string;
          lesson_id: string;
          status: string;
          completed_at: string | null;
          completion_source: string | null;
        }>(sql`
          select enrollment_id, lesson_id, status, completed_at::text, completion_source
          from public.lesson_progress
          where enrollment_id = any(${uuidList(enrollmentIds)})
        `)
      : Promise.resolve([]),
    enrollmentIds.length
      ? rows<{
          id: string;
          event_type: string;
          step_id: string | null;
          payload: Record<string, unknown>;
          created_at: string;
          lesson_id: string;
        }>(sql`
          select id, event_type, step_id, payload, created_at::text, lesson_id
          from public.activity_events
          where enrollment_id = any(${uuidList(enrollmentIds)})
          order by created_at desc
          limit 50
        `)
      : Promise.resolve([]),
    rpc<number>("student_points_total", { p_student: studentId }),
  ]);

  const courseById = new Map(courses.map((row) => [row.id, row]));
  const lessonById = new Map(lessons.map((row) => [row.id, row]));

  const completedByEnrollment = new Map<string, Set<string>>();
  for (const row of progressRows) {
    if (row.status !== "completed") continue;
    const set = completedByEnrollment.get(row.enrollment_id) ?? new Set<string>();
    set.add(row.lesson_id);
    completedByEnrollment.set(row.enrollment_id, set);
  }

  const current = enrollments.find((row) => row.status === "active") ?? enrollments[0] ?? null;
  const currentLessons = current
    ? lessons
        .filter((lesson) => lesson.course_id === current.course_id)
        .sort((a, b) => a.position - b.position)
    : [];
  const progressByLesson = new Map(
    progressRows
      .filter((row) => row.enrollment_id === current?.id)
      .map((row) => [row.lesson_id, row]),
  );

  return {
    student: {
      id: profile.user_id,
      name: profile.display_name,
      email: profile.email,
      disabled: Boolean(profile.disabled_at),
      createdAt: profile.created_at,
      points: Number(totalPoints ?? 0),
    },
    current: current
      ? {
          enrollmentId: current.id,
          status: current.status,
          courseId: current.course_id,
          courseTitle: courseById.get(current.course_id)?.title ?? "未知课程",
          courseSlug: courseById.get(current.course_id)?.slug ?? "",
          currentLesson: current.current_lesson_id
            ? lessonById.get(current.current_lesson_id)?.title ?? null
            : null,
          progress: progressFor(
            current,
            lessons,
            completedByEnrollment.get(current.id) ?? new Set(),
          ),
          startedAt: current.started_at,
          lastSeenAt: current.last_seen_at,
          lastInteractionAt: current.last_interaction_at,
          completedAt: current.completed_at,
          online: isOnline(current.last_seen_at),
        }
      : null,
    history: enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      courseId: enrollment.course_id,
      courseTitle: courseById.get(enrollment.course_id)?.title ?? "未知课程",
      status: enrollment.status,
      progress: progressFor(
        enrollment,
        lessons,
        completedByEnrollment.get(enrollment.id) ?? new Set(),
      ),
      startedAt: enrollment.started_at,
      completedAt: enrollment.completed_at,
    })),
    lessons: currentLessons.map((lesson) => ({
      lessonId: lesson.id,
      title: lesson.title,
      type: lesson.type,
      position: lesson.position,
      required: lesson.required,
      status: (progressByLesson.get(lesson.id)?.status ?? "not_started") as LessonProgressStatus,
      completedAt: progressByLesson.get(lesson.id)?.completed_at ?? null,
      completionSource: progressByLesson.get(lesson.id)?.completion_source ?? null,
    })),
    recentEvents: events.map((event) => ({
      id: event.id,
      type: event.event_type,
      stepId: event.step_id,
      payload: (event.payload ?? {}) as Record<string, unknown>,
      createdAt: event.created_at,
      lessonTitle: lessonById.get(event.lesson_id)?.title ?? null,
    })),
    pointEvents: profileEvents.map((row) => ({
      id: row.id,
      delta: row.delta,
      reason: row.reason,
      createdAt: row.created_at,
    })),
  };
}

export async function createStudent(input: {
  email: string;
  displayName: string;
  initialPassword: string;
}): Promise<{ id: string }> {
  const id = randomUUID();
  const password = await hashPassword(input.initialPassword);
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into public."user" (id, name, email, email_verified, created_at, updated_at)
        values (${id}::uuid, ${input.displayName}, ${input.email}, true, now(), now())
      `);
      await tx.execute(sql`
        insert into public.account
          (id, account_id, provider_id, user_id, password, created_at, updated_at)
        values
          (${randomUUID()}::uuid, ${id}, 'credential', ${id}::uuid, ${password}, now(), now())
      `);
      await tx.execute(sql`
        insert into public.profiles (user_id, email, display_name, role)
        values (${id}::uuid, ${input.email}, ${input.displayName}, 'student')
      `);
    });
  } catch (error) {
    const e = error as { code?: string; message?: string };
    if (e.code === "23505" || e.message?.toLowerCase().includes("duplicate")) {
      throw new ApiError("EMAIL_EXISTS");
    }
    mapDatabaseError({ message: e.message ?? "database error", code: e.code } as never);
  }
  return { id };
}

export async function updateStudent(
  studentId: string,
  patch: { disabled?: boolean; displayName?: string },
): Promise<void> {
  const profile = await one<{ user_id: string; role: string }>(sql`
    select user_id, role from public.profiles where user_id = ${studentId}::uuid limit 1
  `);
  if (!profile || profile.role !== "student") throw new ApiError("STUDENT_NOT_FOUND");

  try {
    await db.execute(sql`
      update public.profiles
      set
        display_name = case when ${patch.displayName !== undefined} then ${patch.displayName ?? null} else display_name end,
        disabled_at = case
          when ${patch.disabled === undefined} then disabled_at
          when ${patch.disabled === true} then now()
          else null
        end
      where user_id = ${studentId}::uuid
    `);
  } catch (error) {
    mapPgError(error);
  }
}

export async function requestPasswordReset(studentId: string): Promise<{ sent: true }> {
  const profile = await one<{ email: string | null; role: string }>(sql`
    select email, role from public.profiles where user_id = ${studentId}::uuid limit 1
  `);
  if (!profile || profile.role !== "student" || !profile.email) {
    throw new ApiError("STUDENT_NOT_FOUND");
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { auth } = await import("@/lib/auth/better");
  try {
    await auth.api.requestPasswordReset({
      body: { email: profile.email, redirectTo: `${appUrl}/login` },
    });
  } catch {
    throw new ApiError("INTERNAL_ERROR", "密码重置邮件发送失败");
  }
  return { sent: true };
}

export async function updateCourse(
  courseId: string,
  patch: { title?: string; description?: string; status?: "draft" | "published" | "archived" },
): Promise<void> {
  const course = await one<{ id: string; status: string }>(sql`
    select id, status from public.courses where id = ${courseId}::uuid limit 1
  `);
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  if (patch.status === "published") {
    const lessons = await rows<{
      id: string;
      title: string;
      required: boolean;
      content_ref: string | null;
      config: Record<string, unknown> | null;
    }>(sql`
      select id, title, required, content_ref, config
      from public.lessons where course_id = ${courseId}::uuid order by position
    `);
    if (lessons.length === 0 || !lessons.some((lesson) => lesson.required)) {
      throw new ApiError("VALIDATION_ERROR", "课程至少需要 1 个必修章节才能发布");
    }
    for (const lesson of lessons) {
      if (!lesson.content_ref) {
        throw new ApiError("VALIDATION_ERROR", `章节 ${lesson.title} 缺少内容资源`);
      }
    }
    const finalExams = lessons.filter(
      (lesson) => (lesson.config as Record<string, unknown> | null)?.finalExam === true,
    );
    if (finalExams.length > 1) {
      throw new ApiError("VALIDATION_ERROR", "课程最多只能有一个最终测验 (finalExam)");
    }
  }

  if (
    patch.title === undefined &&
    patch.description === undefined &&
    patch.status === undefined
  ) {
    return;
  }

  try {
    await db.execute(sql`
      update public.courses
      set
        title = case when ${patch.title !== undefined} then ${patch.title ?? null} else title end,
        description = case when ${patch.description !== undefined} then ${patch.description ?? null} else description end,
        status = case when ${patch.status !== undefined} then ${patch.status ?? null} else status end
      where id = ${courseId}::uuid
    `);
  } catch (error) {
    mapPgError(error);
  }
  invalidateCourseCache();
}

export async function listCourseStudents(
  courseId: string,
  options: {
    status?: EnrollmentStatus;
    page: number;
    pageSize: number;
  },
): Promise<{ items: AdminCourseStudentRow[]; total: number; page: number; pageSize: number }> {
  const course = await one<{ id: string }>(sql`
    select id from public.courses where id = ${courseId}::uuid limit 1
  `);
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  const lessons = await rows<LessonLite>(sql`
    select id, course_id, title, type, position, required, completion_policy, config
    from public.lessons where course_id = ${courseId}::uuid order by position
  `);

  const start = Math.max(0, (options.page - 1) * options.pageSize);
  const totalRow = await one<{ count: string }>(sql`
    select count(*)::text as count
    from public.enrollments
    where course_id = ${courseId}::uuid
      and (${options.status ?? null}::text is null or status = ${options.status ?? null})
  `);

  const enrollments = await rows<EnrollmentLite & {
    display_name: string;
    email: string | null;
    completed_lessons: string[] | null;
  }>(sql`
    select e.id, e.student_id, e.course_id, e.status, e.current_lesson_id,
           e.started_at::text, e.last_seen_at::text, e.last_interaction_at::text,
           e.completed_at::text,
           p.display_name, p.email,
           coalesce(
             (select array_agg(lp.lesson_id)
              from public.lesson_progress lp
              where lp.enrollment_id = e.id and lp.status = 'completed'),
             array[]::uuid[]
           ) as completed_lessons
    from public.enrollments e
    join public.profiles p on p.user_id = e.student_id
    where e.course_id = ${courseId}::uuid
      and (${options.status ?? null}::text is null or e.status = ${options.status ?? null})
    order by e.started_at desc
    offset ${start} limit ${options.pageSize}
  `);

  const lessonById = new Map(lessons.map((row) => [row.id, row]));
  const items = enrollments.map((enrollment) => {
    const completed = new Set(enrollment.completed_lessons ?? []);
    return {
      studentId: enrollment.student_id,
      name: enrollment.display_name ?? "未知学生",
      email: enrollment.email ?? null,
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      progress: progressFor(enrollment, lessons, completed),
      currentLesson: enrollment.current_lesson_id
        ? lessonById.get(enrollment.current_lesson_id)?.title ?? null
        : null,
      lastSeenAt: enrollment.last_seen_at,
      lastInteractionAt: enrollment.last_interaction_at,
      online: isOnline(enrollment.last_seen_at),
    };
  });

  return {
    items,
    total: Number(totalRow?.count ?? items.length),
    page: options.page,
    pageSize: options.pageSize,
  };
}
