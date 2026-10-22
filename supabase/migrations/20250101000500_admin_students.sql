-- Server-side filtering, counting and pagination for the admin student list.
-- The previous implementation pulled every student and history row into Node.js.

create or replace function public.admin_students_page(
  p_q text default null,
  p_online boolean default null,
  p_course uuid default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.admin_students_page(text, boolean, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_students_page(text, boolean, uuid, integer, integer) to service_role;
