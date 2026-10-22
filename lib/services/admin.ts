import { ApiError, mapDatabaseError } from "@/lib/api/errors";
import { getActivityDefinition } from "@/lib/activities/catalog";
import { getValidator } from "@/lib/content/validators.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOnline } from "@/lib/services/shared";
import type {
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
  const required = lessons.filter((lesson) => lesson.course_id === enrollment.course_id && lesson.required);
  const done = required.filter((lesson) => completed.has(lesson.id)).length;
  return {
    total: required.length,
    completed: done,
    percent: required.length === 0 ? 0 : Math.round((done / required.length) * 100),
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("admin_overview");
  if (error) throw error;
  return data as AdminOverview;
}

export async function listStudents(options: {
  q?: string;
  online?: boolean;
  courseId?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: AdminStudentRow[]; total: number; page: number; pageSize: number }> {
  const db = createAdminClient();
  const { data, error } = await db.rpc("admin_students_page", {
    p_q: options.q?.trim() || null,
    p_online: options.online ?? null,
    p_course: options.courseId ?? null,
    p_page: options.page,
    p_page_size: options.pageSize,
  });
  if (error) throw error;
  return data as {
    items: AdminStudentRow[];
    total: number;
    page: number;
    pageSize: number;
  };
}

export async function getStudentDetail(studentId: string): Promise<AdminStudentDetail> {
  const db = createAdminClient();
  const { data: profile, error } = await db
    .from("profiles")
    .select(
      "user_id,email,display_name,disabled_at,created_at,role,point_events(id,delta,reason,created_at)",
    )
    .eq("user_id", studentId)
    .eq("role", "student")
    .maybeSingle();

  if (error) throw error;
  if (!profile) throw new ApiError("STUDENT_NOT_FOUND");

  const profileEvents =
    (profile as unknown as {
      point_events?: { id: string; delta: number; reason: string; created_at: string }[];
    }).point_events ?? [];

  const { data: enrollmentsData, error: enrollmentsError } = await db
    .from("enrollments")
    .select("id,student_id,course_id,status,current_lesson_id,started_at,last_seen_at,last_interaction_at,completed_at")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false });

  if (enrollmentsError) throw enrollmentsError;
  const enrollments = (enrollmentsData ?? []) as EnrollmentLite[];

  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  const enrollmentIds = enrollments.map((row) => row.id);
  const [coursesResult, progressResult, eventsResult, totalPointsResult] = await Promise.all([
      courseIds.length
        ? db
            .from("courses")
            .select(
              "id,title,slug,lessons(id,course_id,title,type,position,required,completion_policy,config)",
            )
            .in("id", courseIds)
        : Promise.resolve({ data: [], error: null }),
      enrollments.length
        ? db
            .from("lesson_progress")
            .select("enrollment_id,lesson_id,status,completed_at,completion_source")
            .in("enrollment_id", enrollmentIds)
        : Promise.resolve({ data: [], error: null }),
      enrollmentIds.length
        ? db
            .from("activity_events")
            .select("id,event_type,step_id,payload,created_at,lesson_id")
            .in("enrollment_id", enrollmentIds)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [], error: null }),
      db.rpc("student_points_total", { p_student: studentId }),
    ]);

  for (const result of [coursesResult, progressResult, eventsResult, totalPointsResult]) {
    if (result.error) throw result.error;
  }

  const courses = coursesResult.data ?? [];
  const lessons = courses.flatMap(
    (course) => (course as unknown as { lessons?: LessonLite[] }).lessons ?? [],
  ) as LessonLite[];
  const progressRows = progressResult.data ?? [];
  const courseById = new Map(courses.map((row) => [row.id, row]));
  const lessonById = new Map(lessons.map((row) => [row.id, row]));

  const completedByEnrollment = new Map<string, Set<string>>();
  for (const row of progressRows) {
    if (row.status !== "completed") continue;
    const set = completedByEnrollment.get(row.enrollment_id) ?? new Set<string>();
    set.add(row.lesson_id);
    completedByEnrollment.set(row.enrollment_id, set);
  }

  const current = enrollments.find((row) => row.status === "active") ?? null;

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
      points: Number(totalPointsResult.data ?? 0),
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
          progress: progressFor(current, lessons, completedByEnrollment.get(current.id) ?? new Set()),
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
      progress: progressFor(enrollment, lessons, completedByEnrollment.get(enrollment.id) ?? new Set()),
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
    recentEvents: (eventsResult.data ?? []).map((event) => ({
      id: event.id,
      type: event.event_type,
      stepId: event.step_id,
      payload: (event.payload ?? {}) as Record<string, unknown>,
      createdAt: event.created_at,
      lessonTitle: lessonById.get(event.lesson_id)?.title ?? null,
    })),
    pointEvents: profileEvents
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50)
      .map((row) => ({
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
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.initialPassword,
    email_confirm: true,
    user_metadata: { display_name: input.displayName },
    app_metadata: { role: "student" },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      throw new ApiError("EMAIL_EXISTS");
    }
    throw error;
  }
  if (!data.user) throw new ApiError("INTERNAL_ERROR");

  return { id: data.user.id };
}

export async function updateStudent(
  studentId: string,
  patch: { disabled?: boolean; displayName?: string },
): Promise<void> {
  const db = createAdminClient();
  const { data: profile, error } = await db
    .from("profiles")
    .select("user_id,role")
    .eq("user_id", studentId)
    .maybeSingle();

  if (error) throw error;
  if (!profile || profile.role !== "student") throw new ApiError("STUDENT_NOT_FOUND");

  const update: Record<string, unknown> = {};
  if (patch.displayName !== undefined) update.display_name = patch.displayName;
  if (patch.disabled !== undefined) {
    update.disabled_at = patch.disabled ? new Date().toISOString() : null;
  }

  if (Object.keys(update).length > 0) {
    const { error: updateError } = await db
      .from("profiles")
      .update(update)
      .eq("user_id", studentId);
    if (updateError) mapDatabaseError(updateError);
  }

  // Business authorisation checks profiles.disabled_at on every request, which
  // keeps a stable ACCOUNT_DISABLED response (a Supabase ban would turn live
  // sessions into UNAUTHENTICATED instead). Login is blocked separately in the
  // sign-in action.
}

export async function requestPasswordReset(studentId: string): Promise<{ sent: true }> {
  const db = createAdminClient();
  const { data: profile, error } = await db
    .from("profiles")
    .select("email,role")
    .eq("user_id", studentId)
    .maybeSingle();

  if (error) throw error;
  if (!profile || profile.role !== "student" || !profile.email) {
    throw new ApiError("STUDENT_NOT_FOUND");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (!url || !anonKey) throw new ApiError("INTERNAL_ERROR");

  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: resetError } = await client.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${appUrl}/login`,
  });

  if (resetError) {
    throw new ApiError("INTERNAL_ERROR", "密码重置邮件发送失败");
  }
  return { sent: true };
}

export async function updateCourse(
  courseId: string,
  patch: { title?: string; description?: string; status?: "draft" | "published" | "archived" },
): Promise<void> {
  const db = createAdminClient();
  const { data: course, error } = await db
    .from("courses")
    .select("id,status")
    .eq("id", courseId)
    .maybeSingle();

  if (error) throw error;
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  if (patch.status === "published") {
    const { data: lessons, error: lessonsError } = await db
      .from("lessons")
      .select("id,title,type,position,required,completion_policy,config,content_ref")
      .eq("course_id", courseId)
      .order("position");

    if (lessonsError) throw lessonsError;
    const list = lessons ?? [];
    if (list.length === 0 || !list.some((lesson) => lesson.required)) {
      throw new ApiError("VALIDATION_ERROR", "课程至少需要 1 个必修章节才能发布");
    }

    const required = list.filter((lesson) => lesson.required);
    const last = required[required.length - 1];
    if (!last || last.type !== "quiz" || !(last.config as Record<string, unknown>)?.finalExam) {
      throw new ApiError("VALIDATION_ERROR", "最后一个必修章节必须是最终测验 (finalExam)");
    }

    for (const lesson of list) {
      if (lesson.type === "interactive") {
        const activityId = (lesson.config as Record<string, unknown>)?.activityId;
        const activity =
          typeof activityId === "string" ? getActivityDefinition(activityId) : null;
        if (!activity || !getValidator(activity.validatorId)) {
          throw new ApiError("VALIDATION_ERROR", `互动章节 ${lesson.title} 缺少有效的活动或验证器`);
        }
      }
      if ((lesson.type === "article" || lesson.type === "quiz") && !lesson.content_ref) {
        throw new ApiError("VALIDATION_ERROR", `章节 ${lesson.title} 缺少内容资源`);
      }
    }
  }

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.status !== undefined) update.status = patch.status;

  if (Object.keys(update).length === 0) return;

  const { error: updateError } = await db.from("courses").update(update).eq("id", courseId);
  if (updateError) mapDatabaseError(updateError);
}

export async function listCourseStudents(
  courseId: string,
  options: {
    status?: EnrollmentStatus;
    page: number;
    pageSize: number;
  },
): Promise<{ items: AdminCourseStudentRow[]; total: number; page: number; pageSize: number }> {
  const db = createAdminClient();

  const { data: course, error: courseError } = await db
    .from("courses")
    .select(
      "id,lessons(id,course_id,title,type,position,required,completion_policy,config)",
    )
    .eq("id", courseId)
    .maybeSingle();
  if (courseError) throw courseError;
  if (!course) throw new ApiError("COURSE_NOT_FOUND");

  const enrollmentsResult = await db
    .from("enrollments")
    .select("id,student_id,course_id,status,current_lesson_id,started_at,last_seen_at,last_interaction_at,completed_at,lesson_progress(lesson_id,status),profiles(user_id,email,display_name)")
    .eq("course_id", courseId)
    .order("started_at", { ascending: false });

  if (enrollmentsResult.error) throw enrollmentsResult.error;

  const enrollments = (enrollmentsResult.data ?? []) as unknown as (EnrollmentLite & {
    profiles: { user_id: string; email: string | null; display_name: string }[] | null;
    lesson_progress?: { lesson_id: string; status: string }[];
  })[];
  const lessons = (((course as unknown as { lessons?: LessonLite[] }).lessons ?? []) as LessonLite[])
    .slice()
    .sort((a, b) => a.position - b.position);

  const filtered = options.status
    ? enrollments.filter((row) => row.status === options.status)
    : enrollments;

  const completedByEnrollment = new Map<string, Set<string>>();
  for (const enrollment of filtered) {
    for (const progress of enrollment.lesson_progress ?? []) {
      if (progress.status !== "completed") continue;
      const set = completedByEnrollment.get(enrollment.id) ?? new Set<string>();
      set.add(progress.lesson_id);
      completedByEnrollment.set(enrollment.id, set);
    }
  }
  const lessonById = new Map(lessons.map((row) => [row.id, row]));

  const items = filtered.map((enrollment) => {
    const profile = Array.isArray(enrollment.profiles)
      ? enrollment.profiles[0]
      : enrollment.profiles;
    return {
      studentId: enrollment.student_id,
      name: profile?.display_name ?? "未知学生",
      email: profile?.email ?? null,
      enrollmentId: enrollment.id,
      enrollmentStatus: enrollment.status,
      progress: progressFor(enrollment, lessons, completedByEnrollment.get(enrollment.id) ?? new Set()),
      currentLesson: enrollment.current_lesson_id
        ? lessonById.get(enrollment.current_lesson_id)?.title ?? null
        : null,
      lastSeenAt: enrollment.last_seen_at,
      lastInteractionAt: enrollment.last_interaction_at,
      online: isOnline(enrollment.last_seen_at),
    };
  });

  const total = items.length;
  const start = (options.page - 1) * options.pageSize;
  return {
    items: items.slice(start, start + options.pageSize),
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}
