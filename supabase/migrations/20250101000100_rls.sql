-- LearnOS MVP — Row Level Security
-- Browser clients are never trusted for business writes. They may only read
-- rows they own (plus published catalog data) and write their own notes.
-- All progress, points, quiz and interaction writes go through the service
-- role after server-side authorisation.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
      and p.disabled_at is null
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.disabled_at is null
  );
$$;

create or replace function public.can_read_course(p_course_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.enrollments e
      where e.course_id = p_course_id
        and e.student_id = auth.uid()
    )
    or (
      public.is_active_user()
      and exists (
        select 1 from public.courses c
        where c.id = p_course_id and c.status = 'published'
      )
    );
$$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_active_user() from public, anon;
revoke all on function public.can_read_course(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.can_read_course(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.activity_events enable row level security;
alter table public.activity_states enable row level security;
alter table public.activity_submissions enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.notes enable row level security;
alter table public.point_events enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select_own_or_admin on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- courses -------------------------------------------------------------------
create policy courses_select on public.courses
  for select to authenticated
  using (
    public.is_admin()
    or public.can_read_course(id)
  );

create policy courses_admin_write on public.courses
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- lessons -------------------------------------------------------------------
create policy lessons_select on public.lessons
  for select to authenticated
  using (public.can_read_course(course_id));

create policy lessons_admin_write on public.lessons
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- enrollments ---------------------------------------------------------------
create policy enrollments_select_own_or_admin on public.enrollments
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- progress ------------------------------------------------------------------
create policy lesson_progress_select on public.lesson_progress
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.student_id = auth.uid()
    )
  );

-- activity ------------------------------------------------------------------
create policy activity_events_select on public.activity_events
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.student_id = auth.uid()
    )
  );

create policy activity_states_select on public.activity_states
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.student_id = auth.uid()
    )
  );

create policy activity_submissions_select on public.activity_submissions
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.student_id = auth.uid()
    )
  );

create policy quiz_attempts_select on public.quiz_attempts
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.enrollments e
      where e.id = enrollment_id and e.student_id = auth.uid()
    )
  );

-- notes: private to the owner. Admins have no policy -> no access. ----------
create policy notes_select_own on public.notes
  for select to authenticated
  using (student_id = auth.uid());

create policy notes_insert_own on public.notes
  for insert to authenticated
  with check (student_id = auth.uid());

create policy notes_update_own on public.notes
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy notes_delete_own on public.notes
  for delete to authenticated
  using (student_id = auth.uid());

-- points --------------------------------------------------------------------
create policy point_events_select on public.point_events
  for select to authenticated
  using (student_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Privileges: least privilege for browser-facing roles.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.courses, public.lessons,
  public.enrollments, public.lesson_progress, public.activity_events,
  public.activity_states, public.activity_submissions, public.quiz_attempts,
  public.notes, public.point_events
  from anon, authenticated;

grant select on public.profiles, public.courses, public.lessons,
  public.enrollments, public.lesson_progress, public.activity_events,
  public.activity_states, public.activity_submissions, public.quiz_attempts,
  public.point_events
  to authenticated;

grant select, insert, update, delete on public.notes to authenticated;

-- The service role bypasses RLS (server-only code) and keeps full access.
grant all on public.profiles, public.courses, public.lessons,
  public.enrollments, public.lesson_progress, public.activity_events,
  public.activity_states, public.activity_submissions, public.quiz_attempts,
  public.notes, public.point_events
  to service_role;
