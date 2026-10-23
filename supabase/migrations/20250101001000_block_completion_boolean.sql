-- Return booleans instead of SQL NULL for chapterCompleted when no progress row exists.
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
