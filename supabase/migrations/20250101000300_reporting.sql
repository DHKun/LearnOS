-- Reporting aggregates: keep the admin overview to a single database round trip.
-- Executable only by the service role; the Route Handler enforces the admin role.

create or replace function public.admin_overview()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.admin_overview() from public, anon, authenticated;
grant execute on function public.admin_overview() to service_role;
