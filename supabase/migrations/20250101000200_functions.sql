-- LearnOS MVP — transactional business logic
-- These SECURITY DEFINER functions are the only place where progress, points,
-- quiz results and interaction state are mutated. They are executable only by
-- the service role (server-side Route Handlers), never by browser clients.

create or replace function public.learnos_assert_student(p_student uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
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

create or replace function public.learnos_progress(p_enrollment uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

create or replace function public.learnos_enrollment_json(p_enrollment uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

create or replace function public.learnos_try_complete(p_enrollment uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

-- Mark a lesson completed exactly once, promoting an existing in_progress row.
-- Returns true when this call performed the completion transition.
create or replace function public.learnos_mark_lesson_completed(
  p_enrollment uuid,
  p_lesson uuid,
  p_source text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------------------------------------------------------------------------
-- Enrollment lifecycle
-- ---------------------------------------------------------------------------
create or replace function public.join_course(p_student uuid, p_course uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.abandon_course(p_student uuid, p_enrollment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------------------------------------------------------------------------
-- Heartbeat: last_seen_at always; last_interaction_at only on lesson change
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_visible boolean,
  p_focused boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------------------------------------------------------------------------
-- Lesson completion (article / reported interactive)
-- ---------------------------------------------------------------------------
create or replace function public.complete_lesson(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_source text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------------------------------------------------------------------------
-- Interaction telemetry
-- ---------------------------------------------------------------------------
create or replace function public.record_event(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_event_id uuid,
  p_type text,
  p_step text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- ---------------------------------------------------------------------------
-- State save / restore with optimistic locking
-- ---------------------------------------------------------------------------
create or replace function public.save_state(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_state jsonb,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments;
  v_state public.activity_states;
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

  select * into v_state
  from public.activity_states
  where enrollment_id = p_enrollment and lesson_id = p_lesson
  for update;

  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'STATE_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    insert into public.activity_states (enrollment_id, lesson_id, state, version)
    values (p_enrollment, p_lesson, coalesce(p_state, '{}'::jsonb), 1)
    returning version into v_version;
  else
    if v_state.version <> coalesce(p_expected_version, -1) then
      raise exception 'STATE_VERSION_CONFLICT' using errcode = 'P0001';
    end if;
    update public.activity_states
    set state = coalesce(p_state, '{}'::jsonb), version = v_state.version + 1, updated_at = now()
    where enrollment_id = p_enrollment and lesson_id = p_lesson
    returning version into v_version;
  end if;

  update public.enrollments
  set last_interaction_at = now(), current_lesson_id = p_lesson
  where id = p_enrollment;

  return jsonb_build_object(
    'version', v_version,
    'updatedAt', now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Server-validated interactive submission
-- ---------------------------------------------------------------------------
create or replace function public.save_submission(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_submission_id uuid,
  p_submission_hash text,
  p_passed boolean,
  p_feedback jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Replays of an already recorded submission are answered from storage even
  -- after the course completed; they must never re-run side effects.
  select * into v_submission from public.activity_submissions where id = p_submission_id;
  if found then
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

-- ---------------------------------------------------------------------------
-- Quiz attempts: server computes score/passed before calling this function.
-- ---------------------------------------------------------------------------
create or replace function public.record_quiz_attempt(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_attempt_id uuid,
  p_score numeric,
  p_passed boolean,
  p_answer_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Idempotent retries return the stored attempt, even for review-only rows.
  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if found then
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

  insert into public.quiz_attempts (id, enrollment_id, lesson_id, score, passed, answer_summary)
  values (p_attempt_id, p_enrollment, p_lesson, p_score, p_passed, coalesce(p_answer_summary, '{}'::jsonb))
  on conflict (id) do nothing;

  v_inserted := found;

  if not v_inserted then
    select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
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

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
create or replace function public.save_note(
  p_student uuid,
  p_lesson uuid,
  p_content text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------------------------------------------------------------------------
-- Permissions: everything above is service-role only.
-- ---------------------------------------------------------------------------
revoke all on function public.learnos_assert_student(uuid) from public, anon, authenticated;
revoke all on function public.learnos_progress(uuid) from public, anon, authenticated;
revoke all on function public.learnos_enrollment_json(uuid) from public, anon, authenticated;
revoke all on function public.learnos_try_complete(uuid) from public, anon, authenticated;
revoke all on function public.learnos_mark_lesson_completed(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.join_course(uuid, uuid) from public, anon, authenticated;
revoke all on function public.abandon_course(uuid, uuid) from public, anon, authenticated;
revoke all on function public.heartbeat(uuid, uuid, uuid, boolean, boolean) from public, anon, authenticated;
revoke all on function public.complete_lesson(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.record_event(uuid, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_state(uuid, uuid, uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.save_submission(uuid, uuid, uuid, uuid, text, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.record_quiz_attempt(uuid, uuid, uuid, uuid, numeric, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.save_note(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.learnos_assert_student(uuid) to service_role;
grant execute on function public.learnos_progress(uuid) to service_role;
grant execute on function public.learnos_enrollment_json(uuid) to service_role;
grant execute on function public.learnos_try_complete(uuid) to service_role;
grant execute on function public.learnos_mark_lesson_completed(uuid, uuid, text) to service_role;
grant execute on function public.join_course(uuid, uuid) to service_role;
grant execute on function public.abandon_course(uuid, uuid) to service_role;
grant execute on function public.heartbeat(uuid, uuid, uuid, boolean, boolean) to service_role;
grant execute on function public.complete_lesson(uuid, uuid, uuid, text) to service_role;
grant execute on function public.record_event(uuid, uuid, uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.save_state(uuid, uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.save_submission(uuid, uuid, uuid, uuid, text, boolean, jsonb) to service_role;
grant execute on function public.record_quiz_attempt(uuid, uuid, uuid, uuid, numeric, boolean, jsonb) to service_role;
grant execute on function public.save_note(uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
