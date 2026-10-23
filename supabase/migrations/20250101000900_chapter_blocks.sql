-- Chapter blocks (Manifest v3)
-- Plain MDX still lives in content/courses; these tables only persist formal
-- in-chapter simulation/question results and their idempotent attempts.

create table public.block_attempts (
  id            uuid primary key,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  block_id      text not null check (char_length(block_id) between 1 and 80),
  block_kind    text not null check (block_kind in ('simulation', 'question')),
  request_hash  text not null,
  passed        boolean not null,
  score         numeric(5, 2),
  feedback      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index block_attempts_enrollment_idx
  on public.block_attempts (enrollment_id, lesson_id, block_id, created_at desc);

create table public.block_results (
  enrollment_id  uuid not null references public.enrollments (id) on delete cascade,
  lesson_id      uuid not null references public.lessons (id) on delete cascade,
  block_id       text not null check (char_length(block_id) between 1 and 80),
  block_kind     text not null check (block_kind in ('simulation', 'question')),
  passed         boolean not null default false,
  attempts       integer not null default 0 check (attempts >= 0),
  last_score     numeric(5, 2),
  last_feedback  jsonb not null default '{}'::jsonb,
  first_passed_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (enrollment_id, lesson_id, block_id)
);

create index block_results_lesson_idx on public.block_results (lesson_id);

alter table public.block_attempts enable row level security;
alter table public.block_results enable row level security;

revoke all on public.block_attempts, public.block_results from anon, authenticated;
grant all on public.block_attempts, public.block_results to service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.learnos_chapter_completion_satisfied(
  p_enrollment uuid,
  p_lesson uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
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

-- ---------------------------------------------------------------------------
-- Save one verified block result. The server has already run the validator or
-- quiz grader; this function only records the trusted result and applies the
-- chapter completion / points transaction exactly once.
-- ---------------------------------------------------------------------------
create or replace function public.save_block_result(
  p_student uuid,
  p_enrollment uuid,
  p_lesson uuid,
  p_block_id text,
  p_block_kind text,
  p_attempt_id uuid,
  p_request_hash text,
  p_passed boolean,
  p_score numeric default null,
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
      'chapterCompleted', v_lesson_status = 'completed',
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
      'chapterCompleted', (
        select status = 'completed' from public.lesson_progress
        where enrollment_id = p_enrollment and lesson_id = p_lesson
      ),
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
    'chapterCompleted', v_lesson_status = 'completed',
    'lessonStatus', v_lesson_status,
    'courseProgress', public.learnos_progress(p_enrollment),
    'enrollmentStatus', case when v_course_completed then 'completed' else v_enrollment.status end,
    'pointsAwarded', v_points
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Hardening: manual completion must not bypass v3 server validation.
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

revoke all on function public.learnos_chapter_completion_satisfied(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_block_result(uuid, uuid, uuid, text, text, uuid, text, boolean, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.complete_lesson(uuid, uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.learnos_chapter_completion_satisfied(uuid, uuid) to service_role;
grant execute on function public.save_block_result(uuid, uuid, uuid, text, text, uuid, text, boolean, numeric, jsonb) to service_role;
grant execute on function public.complete_lesson(uuid, uuid, uuid, text) to service_role;

notify pgrst, 'reload schema';
