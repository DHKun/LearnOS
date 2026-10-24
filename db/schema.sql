--
-- PostgreSQL database dump
--

-- Dumped from database version 17.11
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';

--
-- Name: abandon_course(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.abandon_course(p_student uuid, p_enrollment uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student
  for update;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_enrollment.status = 'abandoned' then
    return public.learnos_enrollment_json(v_enrollment.id);
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  update public.enrollments
  set status = 'abandoned', last_interaction_at = now()
  where id = v_enrollment.id
  returning * into v_enrollment;

  return public.learnos_enrollment_json(v_enrollment.id);
end;
$$;

--
-- Name: admin_overview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_overview() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'studentCount', (select count(*) from public.profiles where role = 'student'),
    'activeEnrollmentCount', (select count(*) from public.enrollments where status = 'active'),
    'onlineCount', (
      select count(*) from public.enrollments
      where status = 'active'
        and last_seen_at is not null
        and last_seen_at > now() - interval '120 seconds'
    ),
    'courseCount', (select count(*) from public.courses),
    'publishedCourseCount', (select count(*) from public.courses where status = 'published'),
    'completedEnrollmentCount', (select count(*) from public.enrollments where status = 'completed'),
    'recentActivity', coalesce((
      select jsonb_agg(item order by last_seen_at desc nulls last)
      from (
        select
          jsonb_build_object(
            'studentId', e.student_id,
            'name', p.display_name,
            'courseTitle', c.title,
            'currentLessonTitle', l.title,
            'progress',
              case
                when pr.total = 0 then 0
                else round(100.0 * pr.done / pr.total)::int
              end,
            'lastSeenAt', e.last_seen_at,
            'lastInteractionAt', e.last_interaction_at,
            'online',
              coalesce(
                e.last_seen_at is not null
                  and e.last_seen_at > now() - interval '120 seconds',
                false
              )
          ) as item,
          e.last_seen_at
        from public.enrollments e
        join public.profiles p on p.user_id = e.student_id
        join public.courses c on c.id = e.course_id
        left join public.lessons l on l.id = e.current_lesson_id
        left join lateral (
          select
            count(*) as total,
            count(*) filter (where lp.status = 'completed') as done
          from public.lessons required
          left join public.lesson_progress lp
            on lp.enrollment_id = e.id and lp.lesson_id = required.id
          where required.course_id = e.course_id
            and required.required
        ) pr on true
        where e.status = 'active'
        order by e.last_seen_at desc nulls last
        limit 8
      ) recent
    ), '[]'::jsonb)
  );
$$;

--
-- Name: admin_students_page(text, boolean, uuid, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_students_page(p_q text DEFAULT NULL::text, p_online boolean DEFAULT NULL::boolean, p_course uuid DEFAULT NULL::uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 20) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with point_totals as (
    select student_id, total from public.student_point_totals()
  ),
  active as (
    select
      e.id,
      e.student_id,
      e.course_id,
      e.status,
      e.current_lesson_id,
      e.last_seen_at,
      e.last_interaction_at,
      c.title as course_title,
      l.title as current_lesson_title,
      case
        when pr.total = 0 then 0
        else round(100.0 * pr.done / pr.total)::int
      end as progress,
      coalesce(
        e.last_seen_at is not null
          and e.last_seen_at > now() - interval '120 seconds',
        false
      ) as online
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    left join public.lessons l on l.id = e.current_lesson_id
    left join lateral (
      select
        count(*) as total,
        count(*) filter (where lp.status = 'completed') as done
      from public.lessons required
      left join public.lesson_progress lp
        on lp.enrollment_id = e.id and lp.lesson_id = required.id
      where required.course_id = e.course_id
        and required.required
    ) pr on true
    where e.status = 'active'
  ),
  filtered as (
    select
      p.user_id,
      p.display_name,
      p.email,
      p.disabled_at,
      a.course_id,
      a.course_title,
      a.current_lesson_title,
      a.progress,
      a.last_seen_at,
      a.last_interaction_at,
      coalesce(a.online, false) as online,
      coalesce(pt.total, 0) as points
    from public.profiles p
    left join active a on a.student_id = p.user_id
    left join point_totals pt on pt.student_id = p.user_id
    where p.role = 'student'
      and (
        p_q is null
        or p_q = ''
        or p.display_name ilike '%' || p_q || '%'
        or coalesce(p.email, '') ilike '%' || p_q || '%'
      )
      and (p_online is null or coalesce(a.online, false) = p_online)
      and (
        p_course is null
        or exists (
          select 1 from public.enrollments e
          where e.student_id = p.user_id and e.course_id = p_course
        )
      )
  ),
  counted as (
    select count(*)::int as total from filtered
  ),
  paged as (
    select *
    from filtered
    order by online desc, last_seen_at desc nulls last, display_name asc
    limit greatest(p_page_size, 1)
    offset greatest((p_page - 1) * p_page_size, 0)
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', paged.user_id,
            'name', paged.display_name,
            'email', paged.email,
            'disabled', paged.disabled_at is not null,
            'activeCourse',
              case
                when paged.course_id is null then null
                else jsonb_build_object('id', paged.course_id, 'title', paged.course_title)
              end,
            'currentLesson', paged.current_lesson_title,
            'progress', coalesce(paged.progress, 0),
            'enrollmentStatus', case when paged.course_id is null then null else 'active' end,
            'lastSeenAt', paged.last_seen_at,
            'lastInteractionAt', paged.last_interaction_at,
            'online', paged.online,
            'points', paged.points
          )
          order by paged.online desc, paged.last_seen_at desc nulls last, paged.display_name asc
        )
        from paged
      ),
      '[]'::jsonb
    ),
    'total', (select total from counted),
    'page', p_page,
    'pageSize', p_page_size
  );
$$;

--
-- Name: append_deployment_log(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_deployment_log(p_job uuid, p_level text, p_message text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.deployment_jobs
  set logs = (
        case
          when jsonb_array_length(logs) >= 2000 then logs - 0
          else logs
        end
      ) || jsonb_build_array(
        jsonb_build_object(
          'at', now(),
          'level', left(coalesce(p_level, 'info'), 16),
          'message', left(coalesce(p_message, ''), 8000)
        )
      ),
      heartbeat_at = now()
  where id = p_job;
end;
$$;

--
-- Name: before_user_created_floatctf(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.before_user_created_floatctf(input jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$ declare provider text := input #>> '{user,app_metadata,provider}'; begin if provider in ('custom:floatctf','keycloak') then return '{}'::jsonb; end if; return jsonb_build_object('error', jsonb_build_object('message','LearnOS 账号由管理员发放，或使用 FloatCTF 登录','http_code',403)); end; $$;

--
-- Name: can_read_course(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_read_course(p_course_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_admin()
    or exists (
      select 1
      from public.enrollments e
      where e.course_id = p_course_id
        and e.student_id = null::uuid
    )
    or (
      public.is_active_user()
      and exists (
        select 1 from public.courses c
        where c.id = p_course_id and c.status = 'published'
      )
    );
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: deployment_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deployment_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind text DEFAULT 'deploy'::text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    phase text,
    deployment_version text NOT NULL,
    image_tag text,
    image_id text,
    previous_version text,
    previous_image_id text,
    rollback_target_job_id uuid,
    requested_by uuid,
    courses jsonb DEFAULT '[]'::jsonb NOT NULL,
    result jsonb DEFAULT '{}'::jsonb NOT NULL,
    logs jsonb DEFAULT '[]'::jsonb NOT NULL,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    CONSTRAINT deployment_jobs_courses_check CHECK ((jsonb_typeof(courses) = 'array'::text)),
    CONSTRAINT deployment_jobs_deployment_version_check CHECK ((deployment_version ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]{2}$'::text)),
    CONSTRAINT deployment_jobs_kind_check CHECK ((kind = ANY (ARRAY['deploy'::text, 'rollback'::text]))),
    CONSTRAINT deployment_jobs_logs_check CHECK ((jsonb_typeof(logs) = 'array'::text)),
    CONSTRAINT deployment_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'validating'::text, 'building'::text, 'syncing'::text, 'switching'::text, 'health_check'::text, 'rolling_back'::text, 'succeeded'::text, 'failed'::text, 'rolled_back'::text])))
);

--
-- Name: TABLE deployment_jobs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.deployment_jobs IS 'Single-host Docker Compose deployment and rollback jobs.';

--
-- Name: claim_deployment_job(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_deployment_job() RETURNS SETOF public.deployment_jobs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  job public.deployment_jobs;
begin
  select * into job
  from public.deployment_jobs
  where status = 'queued'
  order by created_at asc
  limit 1
  for update skip locked;

  if not found then
    return;
  end if;

  update public.deployment_jobs
  set status = 'validating',
      phase = '正在校验',
      started_at = coalesce(started_at, now()),
      heartbeat_at = now()
  where id = job.id
  returning * into job;

  return next job;
end;
$$;

--
-- Name: complete_lesson(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_lesson(p_student uuid, p_enrollment uuid, p_lesson uuid, p_source text DEFAULT 'manual'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
  v_lesson public.lessons;
  v_inserted boolean := false;
  v_points integer := 0;
  v_course_completed boolean := false;
  v_progress jsonb;
  v_lesson_status text;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student
  for update;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_lesson
  from public.lessons
  where id = p_lesson and course_id = v_enrollment.course_id;

  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;

  select status into v_lesson_status
  from public.lesson_progress
  where enrollment_id = p_enrollment and lesson_id = p_lesson;

  if v_enrollment.status = 'completed' then
    return jsonb_build_object(
      'lessonStatus', coalesce(v_lesson_status, 'completed'),
      'courseProgress', public.learnos_progress(p_enrollment),
      'enrollmentStatus', 'completed',
      'pointsAwarded', 0,
      'alreadyCompleted', true
    );
  end if;

  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if v_lesson.type = 'quiz' then
    raise exception 'QUIZ_REQUIRES_SUBMISSION' using errcode = 'P0001';
  end if;
  if v_lesson.type = 'interactive' and v_lesson.completion_policy = 'server_validated' then
    raise exception 'SERVER_VALIDATION_REQUIRED' using errcode = 'P0001';
  end if;
  if v_lesson.type = 'article' and (
    v_lesson.completion_policy = 'server_validated'
    or coalesce(v_lesson.config -> 'completion' ->> 'mode', 'manual') in ('all', 'any')
  ) then
    raise exception 'COMPLETION_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if v_lesson.completion_policy not in ('manual', 'reported') then
    raise exception 'COMPLETION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  v_inserted := public.learnos_mark_lesson_completed(
    p_enrollment,
    p_lesson,
    coalesce(nullif(p_source, ''), 'manual')
  );

  if v_inserted then
    insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key)
    values (p_student, p_enrollment, 10, 'lesson_completed', 'lesson:' || p_enrollment || ':' || p_lesson)
    on conflict (dedupe_key) do nothing;
    v_points := 10;
  end if;

  update public.enrollments set last_interaction_at = now() where id = p_enrollment;

  v_course_completed := public.learnos_try_complete(p_enrollment);
  v_progress := public.learnos_progress(p_enrollment);

  return jsonb_build_object(
    'lessonStatus', 'completed',
    'courseProgress', v_progress,
    'enrollmentStatus', case when v_course_completed then 'completed' else 'active' end,
    'pointsAwarded', v_points,
    'alreadyCompleted', not v_inserted
  );
end;
$$;

--
-- Name: finish_deployment_failure(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.finish_deployment_failure(p_job uuid, p_status text, p_error text, p_result jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_status not in ('failed', 'rolled_back') then
    raise exception 'INVALID_DEPLOYMENT_STATUS' using errcode = 'P0001';
  end if;

  update public.deployment_jobs
  set status = p_status,
      phase = case when p_status = 'rolled_back' then '部署失败，已自动回滚' else '部署失败' end,
      error = left(coalesce(p_error, '部署失败'), 8000),
      result = coalesce(p_result, '{}'::jsonb),
      finished_at = now(),
      heartbeat_at = now()
  where id = p_job;
end;
$$;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    case
      when nullif(new.raw_user_meta_data ->> 'sub', '') is not null
        then 'FloatCTF 用户 ' || left(new.raw_user_meta_data ->> 'sub', 8)
      else split_part(coalesce(new.email, 'student'), '@', 1)
    end
  );

  insert into public.profiles (user_id, email, display_name, role)
  values (
    new.id,
    new.email,
    left(v_display_name, 120),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'student' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

--
-- Name: heartbeat(uuid, uuid, uuid, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.heartbeat(p_student uuid, p_enrollment uuid, p_lesson uuid, p_visible boolean, p_focused boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
  v_valid_lesson uuid;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  if p_lesson is not null then
    select id into v_valid_lesson
    from public.lessons
    where id = p_lesson and course_id = v_enrollment.course_id;
    if not found then
      raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  -- Opening a lesson moves it to in_progress without downgrading completed rows.
  if v_valid_lesson is not null then
    insert into public.lesson_progress (enrollment_id, lesson_id, status)
    values (p_enrollment, v_valid_lesson, 'in_progress')
    on conflict (enrollment_id, lesson_id) do update
      set status = case
        when public.lesson_progress.status = 'completed' then 'completed'
        else 'in_progress'
      end;
  end if;

  update public.enrollments
  set last_seen_at = now(),
      current_lesson_id = coalesce(v_valid_lesson, current_lesson_id),
      last_interaction_at = case
        when coalesce(p_visible, false) and coalesce(p_focused, false)
          and v_valid_lesson is not null
          and v_valid_lesson is distinct from current_lesson_id
        then now()
        else last_interaction_at
      end
  where id = v_enrollment.id
  returning * into v_enrollment;

  return jsonb_build_object(
    'lastSeenAt', v_enrollment.last_seen_at,
    'lastInteractionAt', v_enrollment.last_interaction_at,
    'currentLessonId', v_enrollment.current_lesson_id,
    'status', v_enrollment.status
  );
end;
$$;

--
-- Name: is_active_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_active_user() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = null::uuid
      and p.disabled_at is null
  );
$$;

--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = null::uuid
      and p.role = 'admin'
      and p.disabled_at is null
  );
$$;

--
-- Name: join_course(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_course(p_student uuid, p_course uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_course public.courses;
  v_enrollment public.enrollments;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_course from public.courses where id = p_course;
  if not found then
    raise exception 'COURSE_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_enrollment
  from public.enrollments
  where student_id = p_student and course_id = p_course
  for update;

  if found then
    if v_enrollment.status = 'active' then
      return public.learnos_enrollment_json(v_enrollment.id);
    end if;
    if v_enrollment.status = 'completed' then
      return public.learnos_enrollment_json(v_enrollment.id);
    end if;
    -- abandoned -> active, keeping notes, progress, events and state.
    if v_course.status not in ('published', 'archived') then
      raise exception 'COURSE_NOT_AVAILABLE' using errcode = 'P0001';
    end if;
    begin
      update public.enrollments
      set status = 'active', completed_at = null, last_interaction_at = now()
      where id = v_enrollment.id
      returning * into v_enrollment;
    exception when unique_violation then
      raise exception 'ACTIVE_COURSE_EXISTS' using errcode = 'P0001';
    end;
    return public.learnos_enrollment_json(v_enrollment.id);
  end if;

  if v_course.status <> 'published' then
    raise exception 'COURSE_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.enrollments
    where student_id = p_student and status = 'active'
  ) then
    raise exception 'ACTIVE_COURSE_EXISTS' using errcode = 'P0001';
  end if;

  begin
    insert into public.enrollments (student_id, course_id)
    values (p_student, p_course)
    returning * into v_enrollment;
  exception when unique_violation then
    raise exception 'ACTIVE_COURSE_EXISTS' using errcode = 'P0001';
  end;

  return public.learnos_enrollment_json(v_enrollment.id);
end;
$$;

--
-- Name: learnos_assert_student(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learnos_assert_student(p_student uuid) RETURNS void
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles where user_id = p_student;
  if not found then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_profile.disabled_at is not null then
    raise exception 'ACCOUNT_DISABLED' using errcode = 'P0001';
  end if;
  if v_profile.role <> 'student' then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

--
-- Name: learnos_chapter_completion_satisfied(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learnos_chapter_completion_satisfied(p_enrollment uuid, p_lesson uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_completion jsonb;
  v_mode text;
  v_required text[];
  v_passed integer;
begin
  select coalesce(l.config -> 'completion', '{"mode":"manual","requiredBlocks":[]}'::jsonb)
  into v_completion
  from public.lessons l
  where l.id = p_lesson;

  if not found then
    return false;
  end if;

  v_mode := coalesce(v_completion ->> 'mode', 'manual');
  if v_mode not in ('all', 'any') then
    return false;
  end if;

  select array_agg(value::text)
  into v_required
  from jsonb_array_elements_text(coalesce(v_completion -> 'requiredBlocks', '[]'::jsonb)) value;

  if v_required is null or array_length(v_required, 1) is null then
    return false;
  end if;

  select count(*)
  into v_passed
  from public.block_results br
  where br.enrollment_id = p_enrollment
    and br.lesson_id = p_lesson
    and br.block_id = any (v_required)
    and br.passed;

  if v_mode = 'all' then
    return v_passed >= array_length(v_required, 1);
  end if;
  return v_passed > 0;
end;
$$;

--
-- Name: learnos_enrollment_json(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learnos_enrollment_json(p_enrollment uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'id', e.id,
    'studentId', e.student_id,
    'courseId', e.course_id,
    'status', e.status,
    'currentLessonId', e.current_lesson_id,
    'startedAt', e.started_at,
    'lastSeenAt', e.last_seen_at,
    'lastInteractionAt', e.last_interaction_at,
    'completedAt', e.completed_at,
    'progress', public.learnos_progress(e.id)
  )
  from public.enrollments e
  where e.id = p_enrollment;
$$;

--
-- Name: learnos_mark_lesson_completed(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learnos_mark_lesson_completed(p_enrollment uuid, p_lesson uuid, p_source text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_status text;
begin
  select status into v_status
  from public.lesson_progress
  where enrollment_id = p_enrollment and lesson_id = p_lesson
  for update;

  if found and v_status = 'completed' then
    return false;
  end if;

  insert into public.lesson_progress (enrollment_id, lesson_id, status, completed_at, completion_source)
  values (p_enrollment, p_lesson, 'completed', now(), p_source)
  on conflict (enrollment_id, lesson_id) do update
    set status = 'completed',
        completed_at = now(),
        completion_source = coalesce(public.lesson_progress.completion_source, excluded.completion_source);

  return true;
end;
$$;

--
-- Name: learnos_progress(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learnos_progress(p_enrollment uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'total', count(l.id),
    'completed', count(l.id) filter (where lp.status = 'completed'),
    'percent', coalesce(
      round(100.0 * count(l.id) filter (where lp.status = 'completed')
        / nullif(count(l.id), 0)),
      0
    )::int
  )
  from public.enrollments e
  join public.lessons l on l.course_id = e.course_id and l.required
  left join public.lesson_progress lp
    on lp.enrollment_id = e.id and lp.lesson_id = l.id
  where e.id = p_enrollment;
$$;

--
-- Name: learnos_try_complete(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learnos_try_complete(p_enrollment uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_all_done boolean;
begin
  select
    exists (select 1 from public.lessons l where l.course_id = e.course_id and l.required)
    and not exists (
      select 1
      from public.lessons l
      where l.course_id = e.course_id
        and l.required
        and not exists (
          select 1
          from public.lesson_progress lp
          where lp.enrollment_id = e.id
            and lp.lesson_id = l.id
            and lp.status = 'completed'
        )
    )
  into v_all_done
  from public.enrollments e
  where e.id = p_enrollment and e.status = 'active';

  if coalesce(v_all_done, false) then
    update public.enrollments
    set status = 'completed',
        completed_at = now(),
        current_lesson_id = null,
        last_interaction_at = now()
    where id = p_enrollment and status = 'active';
    return true;
  end if;
  return false;
end;
$$;

--
-- Name: promote_deployment(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_deployment(p_job uuid, p_image_id text, p_image_tag text, p_result jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  job public.deployment_jobs;
begin
  select * into job from public.deployment_jobs where id = p_job for update;
  if not found then
    raise exception 'DEPLOYMENT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.deployment_jobs
  set status = 'succeeded',
      phase = '部署成功',
      image_id = p_image_id,
      image_tag = p_image_tag,
      result = coalesce(p_result, '{}'::jsonb),
      error = null,
      finished_at = now(),
      heartbeat_at = now()
  where id = p_job;

  update public.deployment_state
  set previous_job_id = current_job_id,
      previous_version = current_version,
      previous_image_id = current_image_id,
      current_job_id = job.id,
      current_version = job.deployment_version,
      current_image_id = p_image_id,
      updated_at = now()
  where id = true;
end;
$$;

--
-- Name: promote_rollback(uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.promote_rollback(p_job uuid, p_target_job uuid, p_image_id text, p_image_tag text, p_result jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  job public.deployment_jobs;
  target public.deployment_jobs;
begin
  select * into job from public.deployment_jobs where id = p_job for update;
  if not found then
    raise exception 'DEPLOYMENT_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into target from public.deployment_jobs where id = p_target_job;
  if not found then
    raise exception 'DEPLOYMENT_TARGET_NOT_FOUND' using errcode = 'P0001';
  end if;

  update public.deployment_jobs
  set status = 'succeeded',
      phase = '回滚成功',
      image_id = p_image_id,
      image_tag = p_image_tag,
      deployment_version = target.deployment_version,
      result = coalesce(p_result, '{}'::jsonb),
      error = null,
      finished_at = now(),
      heartbeat_at = now()
  where id = p_job;

  update public.deployment_state
  set previous_job_id = current_job_id,
      previous_version = current_version,
      previous_image_id = current_image_id,
      current_job_id = target.id,
      current_version = target.deployment_version,
      current_image_id = p_image_id,
      updated_at = now()
  where id = true;
end;
$$;

--
-- Name: record_event(uuid, uuid, uuid, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_event(p_student uuid, p_enrollment uuid, p_lesson uuid, p_event_id uuid, p_type text, p_step text DEFAULT NULL::text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_enrollment public.enrollments;
  v_count integer;
  v_inserted boolean := false;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.lessons
    where id = p_lesson and course_id = v_enrollment.course_id
  ) then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_type is null or p_type !~ '^[a-z][a-z0-9_.:-]{0,63}$' then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_payload, '{}'::jsonb)::text) > 8192 then
    raise exception 'PAYLOAD_TOO_LARGE' using errcode = 'P0001';
  end if;

  select count(*) into v_count
  from public.activity_events
  where enrollment_id = p_enrollment and created_at > now() - interval '60 seconds';
  if v_count >= 120 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  insert into public.activity_events (id, enrollment_id, lesson_id, event_type, step_id, payload)
  values (p_event_id, p_enrollment, p_lesson, p_type, p_step, coalesce(p_payload, '{}'::jsonb))
  on conflict (id) do nothing;

  v_inserted := found;

  if v_inserted then
    update public.enrollments
    set last_interaction_at = now(), current_lesson_id = p_lesson
    where id = p_enrollment;
  end if;

  return jsonb_build_object('accepted', true, 'duplicate', not v_inserted);
end;
$_$;

--
-- Name: record_quiz_attempt(uuid, uuid, uuid, uuid, numeric, boolean, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_quiz_attempt(p_student uuid, p_enrollment uuid, p_lesson uuid, p_attempt_id uuid, p_score numeric, p_passed boolean, p_answer_summary jsonb DEFAULT '{}'::jsonb, p_request_hash text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
  v_lesson public.lessons;
  v_attempt public.quiz_attempts;
  v_inserted boolean := false;
  v_points integer := 0;
  v_completed boolean := false;
  v_is_final boolean;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student
  for update;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_lesson
  from public.lessons
  where id = p_lesson and course_id = v_enrollment.course_id;

  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_lesson.type <> 'quiz' then
    raise exception 'NOT_A_QUIZ' using errcode = 'P0001';
  end if;

  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if found then
    if v_attempt.request_hash is not null
      and p_request_hash is not null
      and v_attempt.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'attemptId', v_attempt.id,
      'score', v_attempt.score,
      'passed', v_attempt.passed,
      'courseProgress', public.learnos_progress(p_enrollment),
      'lessonStatus', (
        select status from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      )
    );
  end if;

  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  insert into public.quiz_attempts (id, enrollment_id, lesson_id, score, passed, answer_summary, request_hash)
  values (p_attempt_id, p_enrollment, p_lesson, p_score, p_passed, coalesce(p_answer_summary, '{}'::jsonb), p_request_hash)
  on conflict (id) do nothing;

  v_inserted := found;

  if not v_inserted then
    select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
    if v_attempt.request_hash is not null
      and p_request_hash is not null
      and v_attempt.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'duplicate', true,
      'attemptId', v_attempt.id,
      'score', v_attempt.score,
      'passed', v_attempt.passed,
      'courseProgress', public.learnos_progress(p_enrollment),
      'lessonStatus', (
        select status from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      )
    );
  end if;

  if p_passed and v_enrollment.status = 'active' then
    if public.learnos_mark_lesson_completed(p_enrollment, p_lesson, 'server_validated') then
      insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key)
      values (p_student, p_enrollment, 10, 'lesson_completed', 'lesson:' || p_enrollment || ':' || p_lesson)
      on conflict (dedupe_key) do nothing;
      v_points := 10;
    end if;

    v_is_final := coalesce((v_lesson.config ->> 'finalExam')::boolean, false);
    if v_is_final then
      insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key)
      values (p_student, p_enrollment, 50, 'final_quiz_passed', 'final_quiz:' || p_enrollment)
      on conflict (dedupe_key) do nothing;
      if found then
        v_points := v_points + 50;
      end if;
    end if;

    update public.enrollments
    set last_interaction_at = now(), current_lesson_id = p_lesson
    where id = p_enrollment;

    v_completed := public.learnos_try_complete(p_enrollment);
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'attemptId', p_attempt_id,
    'score', p_score,
    'passed', p_passed,
    'courseProgress', public.learnos_progress(p_enrollment),
    'lessonStatus', case when p_passed then 'completed' else 'in_progress' end,
    'enrollmentStatus', case when v_completed then 'completed' else v_enrollment.status end,
    'pointsAwarded', v_points
  );
end;
$$;

--
-- Name: save_block_result(uuid, uuid, uuid, text, text, uuid, text, boolean, numeric, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_block_result(p_student uuid, p_enrollment uuid, p_lesson uuid, p_block_id text, p_block_kind text, p_attempt_id uuid, p_request_hash text, p_passed boolean, p_score numeric DEFAULT NULL::numeric, p_feedback jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
  v_lesson public.lessons;
  v_attempt public.block_attempts;
  v_block jsonb;
  v_completion jsonb;
  v_mode text;
  v_required text[];
  v_block_result public.block_results;
  v_duplicate boolean := false;
  v_inserted boolean := false;
  v_points integer := 0;
  v_course_completed boolean := false;
  v_lesson_status text;
  v_satisfied boolean := false;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student
  for update;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_lesson
  from public.lessons
  where id = p_lesson and course_id = v_enrollment.course_id;

  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_lesson.type <> 'article' then
    raise exception 'SUBMISSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_block_kind not in ('simulation', 'question') then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_feedback, '{}'::jsonb)::text) > 65536 then
    raise exception 'PAYLOAD_TOO_LARGE' using errcode = 'P0001';
  end if;

  select value
  into v_block
  from jsonb_array_elements(coalesce(v_lesson.config -> 'blocks', '[]'::jsonb)) value
  where value ->> 'id' = p_block_id;

  if v_block is null then
    raise exception 'BLOCK_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_block ->> 'kind' <> p_block_kind then
    raise exception 'BLOCK_KIND_MISMATCH' using errcode = 'P0001';
  end if;

  -- Idempotent replay: same attempt id must carry the same request hash.
  select * into v_attempt from public.block_attempts where id = p_attempt_id;
  if found then
    if v_attempt.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    select * into v_block_result
    from public.block_results
    where enrollment_id = p_enrollment and lesson_id = p_lesson and block_id = p_block_id;
    select status into v_lesson_status
    from public.lesson_progress
    where enrollment_id = p_enrollment and lesson_id = p_lesson;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'passed', v_attempt.passed,
      'score', v_attempt.score,
      'feedback', v_attempt.feedback,
      'blockStatus', case when v_attempt.passed then 'passed' else 'failed' end,
      'chapterCompletionSatisfied', public.learnos_chapter_completion_satisfied(p_enrollment, p_lesson),
      'chapterCompleted', coalesce(v_lesson_status = 'completed', false),
      'lessonStatus', v_lesson_status,
      'courseProgress', public.learnos_progress(p_enrollment),
      'enrollmentStatus', v_enrollment.status,
      'pointsAwarded', 0
    );
  end if;

  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  insert into public.block_attempts (
    id, enrollment_id, lesson_id, block_id, block_kind,
    request_hash, passed, score, feedback
  )
  values (
    p_attempt_id, p_enrollment, p_lesson, p_block_id, p_block_kind,
    p_request_hash, p_passed, p_score, coalesce(p_feedback, '{}'::jsonb)
  )
  on conflict (id) do nothing;

  v_inserted := found;

  if not v_inserted then
    select * into v_attempt from public.block_attempts where id = p_attempt_id;
    if v_attempt.request_hash <> p_request_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'passed', v_attempt.passed,
      'score', v_attempt.score,
      'feedback', v_attempt.feedback,
      'blockStatus', case when v_attempt.passed then 'passed' else 'failed' end,
      'chapterCompletionSatisfied', public.learnos_chapter_completion_satisfied(p_enrollment, p_lesson),
      'chapterCompleted', coalesce((
        select status = 'completed' from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      ), false),
      'lessonStatus', (
        select status from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      ),
      'courseProgress', public.learnos_progress(p_enrollment),
      'enrollmentStatus', v_enrollment.status,
      'pointsAwarded', 0
    );
  end if;

  insert into public.block_results (
    enrollment_id, lesson_id, block_id, block_kind,
    passed, attempts, last_score, last_feedback, first_passed_at
  )
  values (
    p_enrollment, p_lesson, p_block_id, p_block_kind,
    p_passed, 1, p_score, coalesce(p_feedback, '{}'::jsonb),
    case when p_passed then now() else null end
  )
  on conflict (enrollment_id, lesson_id, block_id) do update
    set attempts = public.block_results.attempts + 1,
        passed = public.block_results.passed or excluded.passed,
        first_passed_at = coalesce(public.block_results.first_passed_at, excluded.first_passed_at),
        last_score = excluded.last_score,
        last_feedback = excluded.last_feedback,
        updated_at = now();

  update public.enrollments
  set last_interaction_at = now(), current_lesson_id = p_lesson
  where id = p_enrollment;

  v_completion := coalesce(v_lesson.config -> 'completion', '{"mode":"manual","requiredBlocks":[]}'::jsonb);
  v_mode := coalesce(v_completion ->> 'mode', 'manual');
  select array_agg(value::text)
  into v_required
  from jsonb_array_elements_text(coalesce(v_completion -> 'requiredBlocks', '[]'::jsonb)) value;

  if v_mode in ('all', 'any') and v_required is not null then
    v_satisfied := public.learnos_chapter_completion_satisfied(p_enrollment, p_lesson);
    if v_satisfied then
      v_inserted := public.learnos_mark_lesson_completed(
        p_enrollment,
        p_lesson,
        'server_validated'
      );
      if v_inserted then
        insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key)
        values (
          p_student, p_enrollment, 10, 'lesson_completed',
          'lesson:' || p_enrollment || ':' || p_lesson
        )
        on conflict (dedupe_key) do nothing;
        if found then
          v_points := 10;
        end if;
        -- A finalExam chapter is a normal server-validated chapter with a
        -- required question block; keep the one-time +50 bonus for it.
        if coalesce((v_lesson.config ->> 'finalExam')::boolean, false) then
          insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key)
          values (
            p_student, p_enrollment, 50, 'final_quiz_passed',
            'final_quiz:' || p_enrollment
          )
          on conflict (dedupe_key) do nothing;
          if found then
            v_points := v_points + 50;
          end if;
        end if;
      end if;
      v_course_completed := public.learnos_try_complete(p_enrollment);
    end if;
  end if;

  select status into v_lesson_status
  from public.lesson_progress
  where enrollment_id = p_enrollment and lesson_id = p_lesson;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'passed', p_passed,
    'score', p_score,
    'feedback', coalesce(p_feedback, '{}'::jsonb),
    'blockStatus', case when p_passed then 'passed' else 'failed' end,
    'chapterCompletionSatisfied', v_satisfied,
    'chapterCompleted', coalesce(v_lesson_status = 'completed', false),
    'lessonStatus', v_lesson_status,
    'courseProgress', public.learnos_progress(p_enrollment),
    'enrollmentStatus', case when v_course_completed then 'completed' else v_enrollment.status end,
    'pointsAwarded', v_points
  );
end;
$$;

--
-- Name: save_note(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_note(p_student uuid, p_lesson uuid, p_content text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_updated timestamptz;
  v_course uuid;
  v_enrollment uuid;
begin
  perform public.learnos_assert_student(p_student);

  if octet_length(coalesce(p_content, '')) > 65536 then
    raise exception 'NOTE_TOO_LARGE' using errcode = 'P0001';
  end if;

  select course_id into v_course from public.lessons where id = p_lesson;
  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;

  select id into v_enrollment
  from public.enrollments
  where student_id = p_student and course_id = v_course
  order by (status = 'active') desc, started_at desc
  limit 1;

  if not found then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  insert into public.notes (student_id, lesson_id, content, updated_at)
  values (p_student, p_lesson, coalesce(p_content, ''), now())
  on conflict (student_id, lesson_id) do update
    set content = excluded.content, updated_at = now()
  returning updated_at into v_updated;

  update public.enrollments
  set last_interaction_at = now()
  where id = v_enrollment and status = 'active';

  return jsonb_build_object('updatedAt', v_updated);
end;
$$;

--
-- Name: save_state(uuid, uuid, uuid, jsonb, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_state(p_student uuid, p_enrollment uuid, p_lesson uuid, p_state jsonb, p_expected_version integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
  v_version integer;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.lessons
    where id = p_lesson and course_id = v_enrollment.course_id
  ) then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;
  if octet_length(coalesce(p_state, '{}'::jsonb)::text) > 65536 then
    raise exception 'PAYLOAD_TOO_LARGE' using errcode = 'P0001';
  end if;

  if coalesce(p_expected_version, 0) = 0 then
    insert into public.activity_states (enrollment_id, lesson_id, state, version)
    values (p_enrollment, p_lesson, coalesce(p_state, '{}'::jsonb), 1)
    on conflict (enrollment_id, lesson_id) do nothing
    returning version into v_version;
  else
    update public.activity_states
    set state = coalesce(p_state, '{}'::jsonb),
        version = version + 1,
        updated_at = now()
    where enrollment_id = p_enrollment
      and lesson_id = p_lesson
      and version = p_expected_version
    returning version into v_version;
  end if;

  if v_version is null then
    raise exception 'STATE_VERSION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.enrollments
  set last_interaction_at = now(), current_lesson_id = p_lesson
  where id = p_enrollment;

  return jsonb_build_object('version', v_version, 'updatedAt', now());
end;
$$;

--
-- Name: save_submission(uuid, uuid, uuid, uuid, text, boolean, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_submission(p_student uuid, p_enrollment uuid, p_lesson uuid, p_submission_id uuid, p_submission_hash text, p_passed boolean, p_feedback jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_enrollment public.enrollments;
  v_lesson public.lessons;
  v_submission public.activity_submissions;
  v_inserted boolean := false;
  v_points integer := 0;
  v_course_completed boolean := false;
begin
  perform public.learnos_assert_student(p_student);

  select * into v_enrollment
  from public.enrollments
  where id = p_enrollment and student_id = p_student
  for update;

  if not found then
    raise exception 'ENROLLMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select * into v_lesson
  from public.lessons
  where id = p_lesson and course_id = v_enrollment.course_id;

  if not found then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_lesson.type <> 'interactive' or v_lesson.completion_policy <> 'server_validated' then
    raise exception 'SUBMISSION_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into v_submission from public.activity_submissions where id = p_submission_id;
  if found then
    if v_submission.submission_hash <> p_submission_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'passed', v_submission.passed,
      'feedback', v_submission.feedback,
      'lessonStatus', (
        select status from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      ),
      'courseProgress', public.learnos_progress(p_enrollment)
    );
  end if;

  if v_enrollment.status <> 'active' then
    raise exception 'ENROLLMENT_NOT_ACTIVE' using errcode = 'P0001';
  end if;

  insert into public.activity_submissions (id, enrollment_id, lesson_id, submission_hash, passed, feedback)
  values (p_submission_id, p_enrollment, p_lesson, p_submission_hash, p_passed, coalesce(p_feedback, '{}'::jsonb))
  on conflict (id) do nothing;

  v_inserted := found;

  if not v_inserted then
    select * into v_submission from public.activity_submissions where id = p_submission_id;
    if v_submission.submission_hash <> p_submission_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = 'P0001';
    end if;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'passed', v_submission.passed,
      'feedback', v_submission.feedback,
      'lessonStatus', (
        select status from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      ),
      'courseProgress', public.learnos_progress(p_enrollment)
    );
  end if;

  if p_passed and v_enrollment.status = 'active' then
    if public.learnos_mark_lesson_completed(p_enrollment, p_lesson, 'server_validated') then
      insert into public.point_events (student_id, enrollment_id, delta, reason, dedupe_key)
      values (p_student, p_enrollment, 10, 'lesson_completed', 'lesson:' || p_enrollment || ':' || p_lesson)
      on conflict (dedupe_key) do nothing;
      v_points := 10;
    end if;

    update public.enrollments
    set last_interaction_at = now(), current_lesson_id = p_lesson
    where id = p_enrollment;
    v_course_completed := public.learnos_try_complete(p_enrollment);
  end if;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'passed', p_passed,
    'feedback', coalesce(p_feedback, '{}'::jsonb),
    'lessonStatus', case when p_passed then 'completed' else null end,
    'courseProgress', public.learnos_progress(p_enrollment),
    'enrollmentStatus', case when v_course_completed then 'completed' else v_enrollment.status end,
    'pointsAwarded', v_points
  );
end;
$$;

--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

--
-- Name: student_point_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_point_totals() RETURNS TABLE(student_id uuid, total integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select student_id, coalesce(sum(delta), 0)::int as total
  from public.point_events
  group by student_id;
$$;

--
-- Name: student_points_total(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.student_points_total(p_student uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(sum(delta), 0)::int
  from public.point_events
  where student_id = p_student;
$$;

--
-- Name: activity_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_events (
    id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    event_type text NOT NULL,
    step_id text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_events_event_type_check CHECK (((char_length(event_type) >= 1) AND (char_length(event_type) <= 64))),
    CONSTRAINT activity_events_step_id_check CHECK (((step_id IS NULL) OR (char_length(step_id) <= 128)))
);

--
-- Name: activity_states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_states (
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT activity_states_version_check CHECK ((version > 0))
);

--
-- Name: activity_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_submissions (
    id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    submission_hash text NOT NULL,
    passed boolean NOT NULL,
    feedback jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

--
-- Name: block_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_attempts (
    id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    block_id text NOT NULL,
    block_kind text NOT NULL,
    request_hash text NOT NULL,
    passed boolean NOT NULL,
    score numeric(5,2),
    feedback jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT block_attempts_block_id_check CHECK (((char_length(block_id) >= 1) AND (char_length(block_id) <= 80))),
    CONSTRAINT block_attempts_block_kind_check CHECK ((block_kind = ANY (ARRAY['simulation'::text, 'question'::text])))
);

--
-- Name: block_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.block_results (
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    block_id text NOT NULL,
    block_kind text NOT NULL,
    passed boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_score numeric(5,2),
    last_feedback jsonb DEFAULT '{}'::jsonb NOT NULL,
    first_passed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT block_results_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT block_results_block_id_check CHECK (((char_length(block_id) >= 1) AND (char_length(block_id) <= 80))),
    CONSTRAINT block_results_block_kind_check CHECK ((block_kind = ANY (ARRAY['simulation'::text, 'question'::text])))
);

--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    content_version text DEFAULT '0.0.0'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT courses_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
    CONSTRAINT courses_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))),
    CONSTRAINT courses_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160)))
);

--
-- Name: deployment_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deployment_state (
    id boolean DEFAULT true NOT NULL,
    current_job_id uuid,
    previous_job_id uuid,
    current_version text,
    previous_version text,
    current_image_id text,
    previous_image_id text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deployment_state_id_check CHECK (id)
);

--
-- Name: TABLE deployment_state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.deployment_state IS 'Current and previous successful LearnOS image references.';

--
-- Name: enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    course_id uuid NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_lesson_id uuid,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone,
    last_interaction_at timestamp with time zone,
    completed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enrollments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'abandoned'::text])))
);

--
-- Name: lesson_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_progress (
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    completed_at timestamp with time zone,
    completion_source text,
    CONSTRAINT lesson_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text])))
);

--
-- Name: lessons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lessons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    course_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    "position" integer NOT NULL,
    type text NOT NULL,
    required boolean DEFAULT true NOT NULL,
    content_ref text,
    completion_policy text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT lessons_completion_policy_check CHECK ((completion_policy = ANY (ARRAY['manual'::text, 'reported'::text, 'server_validated'::text]))),
    CONSTRAINT lessons_content_shape CHECK ((((type = 'interactive'::text) AND (NULLIF((config ->> 'activityId'::text), ''::text) IS NOT NULL)) OR ((type = ANY (ARRAY['article'::text, 'quiz'::text])) AND (content_ref IS NOT NULL)))),
    CONSTRAINT lessons_position_check CHECK (("position" >= 0)),
    CONSTRAINT lessons_slug_check CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
    CONSTRAINT lessons_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 160))),
    CONSTRAINT lessons_type_check CHECK ((type = ANY (ARRAY['article'::text, 'interactive'::text, 'quiz'::text])))
);

--
-- Name: notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notes (
    student_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    content text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notes_content_check CHECK ((octet_length(content) <= 65536))
);

--
-- Name: point_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.point_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    delta integer NOT NULL,
    reason text NOT NULL,
    dedupe_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT point_events_delta_check CHECK ((delta <> 0))
);

--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    user_id uuid NOT NULL,
    email text,
    display_name text NOT NULL,
    role text DEFAULT 'student'::text NOT NULL,
    disabled_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT profiles_display_name_check CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 120))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['student'::text, 'admin'::text])))
);

--
-- Name: quiz_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quiz_attempts (
    id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    lesson_id uuid NOT NULL,
    score numeric(5,2) NOT NULL,
    passed boolean NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    answer_summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    request_hash text,
    CONSTRAINT quiz_attempts_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))
);

--
-- Name: activity_events activity_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_pkey PRIMARY KEY (id);

--
-- Name: activity_states activity_states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_states
    ADD CONSTRAINT activity_states_pkey PRIMARY KEY (enrollment_id, lesson_id);

--
-- Name: activity_submissions activity_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_submissions
    ADD CONSTRAINT activity_submissions_pkey PRIMARY KEY (id);

--
-- Name: block_attempts block_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_attempts
    ADD CONSTRAINT block_attempts_pkey PRIMARY KEY (id);

--
-- Name: block_results block_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_results
    ADD CONSTRAINT block_results_pkey PRIMARY KEY (enrollment_id, lesson_id, block_id);

--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);

--
-- Name: courses courses_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_slug_key UNIQUE (slug);

--
-- Name: deployment_jobs deployment_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_jobs
    ADD CONSTRAINT deployment_jobs_pkey PRIMARY KEY (id);

--
-- Name: deployment_state deployment_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_state
    ADD CONSTRAINT deployment_state_pkey PRIMARY KEY (id);

--
-- Name: enrollments enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_pkey PRIMARY KEY (id);

--
-- Name: enrollments enrollments_student_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_course_id_key UNIQUE (student_id, course_id);

--
-- Name: lesson_progress lesson_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_pkey PRIMARY KEY (enrollment_id, lesson_id);

--
-- Name: lessons lessons_course_id_position_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_course_id_position_key UNIQUE (course_id, "position");

--
-- Name: lessons lessons_course_id_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_course_id_slug_key UNIQUE (course_id, slug);

--
-- Name: lessons lessons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_pkey PRIMARY KEY (id);

--
-- Name: notes notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_pkey PRIMARY KEY (student_id, lesson_id);

--
-- Name: point_events point_events_dedupe_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_events
    ADD CONSTRAINT point_events_dedupe_key_key UNIQUE (dedupe_key);

--
-- Name: point_events point_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_events
    ADD CONSTRAINT point_events_pkey PRIMARY KEY (id);

--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (user_id);

--
-- Name: quiz_attempts quiz_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_pkey PRIMARY KEY (id);

--
-- Name: activity_events_enrollment_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_events_enrollment_time_idx ON public.activity_events USING btree (enrollment_id, created_at DESC);

--
-- Name: activity_events_lesson_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_events_lesson_time_idx ON public.activity_events USING btree (lesson_id, created_at DESC);

--
-- Name: activity_submissions_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX activity_submissions_enrollment_idx ON public.activity_submissions USING btree (enrollment_id, lesson_id);

--
-- Name: block_attempts_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_attempts_enrollment_idx ON public.block_attempts USING btree (enrollment_id, lesson_id, block_id, created_at DESC);

--
-- Name: block_results_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX block_results_lesson_idx ON public.block_results USING btree (lesson_id);

--
-- Name: deployment_jobs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deployment_jobs_created_idx ON public.deployment_jobs USING btree (created_at DESC);

--
-- Name: deployment_jobs_one_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX deployment_jobs_one_active ON public.deployment_jobs USING btree ((true)) WHERE (status = ANY (ARRAY['queued'::text, 'validating'::text, 'building'::text, 'syncing'::text, 'switching'::text, 'health_check'::text, 'rolling_back'::text]));

--
-- Name: deployment_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX deployment_jobs_status_idx ON public.deployment_jobs USING btree (status);

--
-- Name: enrollments_course_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_course_status_idx ON public.enrollments USING btree (course_id, status);

--
-- Name: enrollments_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enrollments_student_idx ON public.enrollments USING btree (student_id);

--
-- Name: lesson_progress_lesson_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lesson_progress_lesson_idx ON public.lesson_progress USING btree (lesson_id);

--
-- Name: lessons_course_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lessons_course_idx ON public.lessons USING btree (course_id, "position");

--
-- Name: one_active_enrollment_per_student; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX one_active_enrollment_per_student ON public.enrollments USING btree (student_id) WHERE (status = 'active'::text);

--
-- Name: point_events_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX point_events_enrollment_idx ON public.point_events USING btree (enrollment_id);

--
-- Name: point_events_student_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX point_events_student_idx ON public.point_events USING btree (student_id, created_at DESC);

--
-- Name: quiz_attempts_enrollment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX quiz_attempts_enrollment_idx ON public.quiz_attempts USING btree (enrollment_id, lesson_id, submitted_at DESC);

--
-- Name: courses courses_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER courses_set_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: enrollments enrollments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER enrollments_set_updated_at BEFORE UPDATE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: lessons lessons_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER lessons_set_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

--
-- Name: activity_events activity_events_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: activity_events activity_events_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_events
    ADD CONSTRAINT activity_events_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: activity_states activity_states_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_states
    ADD CONSTRAINT activity_states_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: activity_states activity_states_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_states
    ADD CONSTRAINT activity_states_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: activity_submissions activity_submissions_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_submissions
    ADD CONSTRAINT activity_submissions_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: activity_submissions activity_submissions_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_submissions
    ADD CONSTRAINT activity_submissions_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: block_attempts block_attempts_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_attempts
    ADD CONSTRAINT block_attempts_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: block_attempts block_attempts_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_attempts
    ADD CONSTRAINT block_attempts_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: block_results block_results_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_results
    ADD CONSTRAINT block_results_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: block_results block_results_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.block_results
    ADD CONSTRAINT block_results_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: deployment_jobs deployment_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_jobs
    ADD CONSTRAINT deployment_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.profiles(user_id) ON DELETE SET NULL;

--
-- Name: deployment_jobs deployment_jobs_rollback_target_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_jobs
    ADD CONSTRAINT deployment_jobs_rollback_target_job_id_fkey FOREIGN KEY (rollback_target_job_id) REFERENCES public.deployment_jobs(id) ON DELETE SET NULL;

--
-- Name: deployment_state deployment_state_current_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_state
    ADD CONSTRAINT deployment_state_current_job_id_fkey FOREIGN KEY (current_job_id) REFERENCES public.deployment_jobs(id) ON DELETE SET NULL;

--
-- Name: deployment_state deployment_state_previous_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deployment_state
    ADD CONSTRAINT deployment_state_previous_job_id_fkey FOREIGN KEY (previous_job_id) REFERENCES public.deployment_jobs(id) ON DELETE SET NULL;

--
-- Name: enrollments enrollments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;

--
-- Name: enrollments enrollments_current_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_current_lesson_id_fkey FOREIGN KEY (current_lesson_id) REFERENCES public.lessons(id) ON DELETE SET NULL;

--
-- Name: enrollments enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enrollments
    ADD CONSTRAINT enrollments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

--
-- Name: lesson_progress lesson_progress_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: lesson_progress lesson_progress_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: lessons lessons_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT lessons_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- Name: notes notes_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: notes notes_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

--
-- Name: point_events point_events_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_events
    ADD CONSTRAINT point_events_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: point_events point_events_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.point_events
    ADD CONSTRAINT point_events_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

--
-- Name: profiles profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--


--
-- Name: quiz_attempts quiz_attempts_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.enrollments(id) ON DELETE CASCADE;

--
-- Name: quiz_attempts quiz_attempts_lesson_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quiz_attempts
    ADD CONSTRAINT quiz_attempts_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

--
-- Name: activity_events; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: activity_events activity_events_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: activity_states; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: activity_states activity_states_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: activity_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: activity_submissions activity_submissions_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: block_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: block_results; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: courses courses_admin_write; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: courses courses_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: deployment_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: deployment_state; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: enrollments enrollments_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: lesson_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: lesson_progress lesson_progress_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: lessons; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: lessons lessons_admin_write; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: lessons lessons_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: notes; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: notes notes_delete_own; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: notes notes_insert_own; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: notes notes_select_own; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: notes notes_update_own; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: point_events; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: point_events point_events_select; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: profiles profiles_select_own_or_admin; Type: POLICY; Schema: public; Owner: -
--

--
-- Name: quiz_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

--
-- Name: quiz_attempts quiz_attempts_select; Type: POLICY; Schema: public; Owner: -
--

--
-- PostgreSQL database dump complete
--

