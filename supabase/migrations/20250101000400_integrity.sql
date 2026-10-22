-- Integrity hardening after static audit:
-- * reject idempotency-key reuse with a different payload
-- * atomic first state write
-- * exact point totals via SQL aggregation

alter table public.quiz_attempts
  add column if not exists request_hash text;

-- ---------------------------------------------------------------------------
-- Save interactive state: no read-then-insert race.
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

-- ---------------------------------------------------------------------------
-- Interactive submission: same id must carry the same payload hash.
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

-- ---------------------------------------------------------------------------
-- Quiz attempt: same attempt id must carry the same canonical answers hash.
-- ---------------------------------------------------------------------------
drop function if exists public.record_quiz_attempt(uuid, uuid, uuid, uuid, numeric, boolean, jsonb);

create or replace function public.record_quiz_attempt(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_attempt_id uuid,
  p_score numeric,
  p_passed boolean,
  p_answer_summary jsonb default '{}'::jsonb,
  p_request_hash text default null
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

  select * into v_attempt from public.quiz_attempts where id = p_attempt_id;
  if found then
    if v_attempt.request_hash is null and p_request_hash is not null then
      -- Legacy rows created before request fingerprints existed: claim the key.
      update public.quiz_attempts
      set request_hash = p_request_hash
      where id = p_attempt_id;
    elsif v_attempt.request_hash is not null
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

-- ---------------------------------------------------------------------------
-- Exact point totals (never derived from a truncated detail page).
-- ---------------------------------------------------------------------------
create or replace function public.student_points_total(p_student uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(delta), 0)::int
  from public.point_events
  where student_id = p_student;
$$;

create or replace function public.student_point_totals()
returns table (student_id uuid, total integer)
language sql
stable
security definer
set search_path = public
as $$
  select student_id, coalesce(sum(delta), 0)::int as total
  from public.point_events
  group by student_id;
$$;

revoke all on function public.student_points_total(uuid) from public, anon, authenticated;
revoke all on function public.student_point_totals() from public, anon, authenticated;
grant execute on function public.student_points_total(uuid) to service_role;
grant execute on function public.student_point_totals() to service_role;

revoke all on function public.record_quiz_attempt(uuid, uuid, uuid, uuid, numeric, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_quiz_attempt(uuid, uuid, uuid, uuid, numeric, boolean, jsonb, text) to service_role;
