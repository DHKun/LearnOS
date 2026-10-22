-- LearnOS MVP — core schema
-- All business tables live in the `public` schema and use UTC timestamps.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text not null check (char_length(display_name) between 1 and 120),
  role         text not null default 'student' check (role in ('student', 'admin')),
  disabled_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- courses / lessons
-- ---------------------------------------------------------------------------
create table public.courses (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title           text not null check (char_length(title) between 1 and 160),
  description     text not null default '',
  status          text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  content_version text not null default '0.0.0',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.lessons (
  id                uuid primary key default gen_random_uuid(),
  course_id         uuid not null references public.courses (id) on delete cascade,
  slug              text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title             text not null check (char_length(title) between 1 and 160),
  position          integer not null check (position >= 0),
  type              text not null check (type in ('article', 'interactive', 'quiz')),
  required          boolean not null default true,
  content_ref       text,
  completion_policy text not null check (completion_policy in ('manual', 'reported', 'server_validated')),
  config            jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (course_id, slug),
  unique (course_id, position),
  constraint lessons_content_shape check (
    (type = 'interactive' and config ? 'entryUrl')
    or (type in ('article', 'quiz') and content_ref is not null)
  )
);

create index lessons_course_idx on public.lessons (course_id, position);

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------
create table public.enrollments (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references public.profiles (user_id) on delete cascade,
  course_id           uuid not null references public.courses (id) on delete restrict,
  status              text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  current_lesson_id   uuid references public.lessons (id) on delete set null,
  started_at          timestamptz not null default now(),
  last_seen_at        timestamptz,
  last_interaction_at timestamptz,
  completed_at        timestamptz,
  updated_at          timestamptz not null default now(),
  unique (student_id, course_id)
);

-- One in-progress course per student, enforced atomically by PostgreSQL.
create unique index one_active_enrollment_per_student
  on public.enrollments (student_id)
  where status = 'active';

create index enrollments_course_status_idx on public.enrollments (course_id, status);
create index enrollments_student_idx on public.enrollments (student_id);

-- ---------------------------------------------------------------------------
-- learning progress & interaction
-- ---------------------------------------------------------------------------
create table public.lesson_progress (
  enrollment_id     uuid not null references public.enrollments (id) on delete cascade,
  lesson_id         uuid not null references public.lessons (id) on delete cascade,
  status            text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed')),
  completed_at      timestamptz,
  completion_source text,
  primary key (enrollment_id, lesson_id)
);

create index lesson_progress_lesson_idx on public.lesson_progress (lesson_id);

create table public.activity_events (
  id            uuid primary key,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  event_type    text not null check (char_length(event_type) between 1 and 64),
  step_id       text check (step_id is null or char_length(step_id) <= 128),
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index activity_events_enrollment_time_idx on public.activity_events (enrollment_id, created_at desc);
create index activity_events_lesson_time_idx on public.activity_events (lesson_id, created_at desc);

create table public.activity_states (
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  lesson_id     uuid not null references public.lessons (id) on delete cascade,
  state         jsonb not null default '{}'::jsonb,
  version       integer not null default 1 check (version > 0),
  updated_at    timestamptz not null default now(),
  primary key (enrollment_id, lesson_id)
);

create table public.activity_submissions (
  id              uuid primary key,
  enrollment_id   uuid not null references public.enrollments (id) on delete cascade,
  lesson_id       uuid not null references public.lessons (id) on delete cascade,
  submission_hash text not null,
  passed          boolean not null,
  feedback        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index activity_submissions_enrollment_idx on public.activity_submissions (enrollment_id, lesson_id);

create table public.quiz_attempts (
  id             uuid primary key,
  enrollment_id  uuid not null references public.enrollments (id) on delete cascade,
  lesson_id      uuid not null references public.lessons (id) on delete cascade,
  score          numeric(5, 2) not null check (score >= 0 and score <= 100),
  passed         boolean not null,
  submitted_at   timestamptz not null default now(),
  answer_summary jsonb not null default '{}'::jsonb
);

create index quiz_attempts_enrollment_idx on public.quiz_attempts (enrollment_id, lesson_id, submitted_at desc);

-- ---------------------------------------------------------------------------
-- notes
-- ---------------------------------------------------------------------------
create table public.notes (
  student_id uuid not null references public.profiles (user_id) on delete cascade,
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  content    text not null default '' check (octet_length(content) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

-- ---------------------------------------------------------------------------
-- point ledger
-- ---------------------------------------------------------------------------
create table public.point_events (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.profiles (user_id) on delete cascade,
  enrollment_id uuid not null references public.enrollments (id) on delete cascade,
  delta         integer not null check (delta <> 0),
  reason        text not null,
  dedupe_key    text not null unique,
  created_at    timestamptz not null default now()
);

create index point_events_student_idx on public.point_events (student_id, created_at desc);
create index point_events_enrollment_idx on public.point_events (enrollment_id);

-- ---------------------------------------------------------------------------
-- timestamps / identity triggers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function public.set_updated_at();

-- Every auth user gets exactly one profile. The role can only arrive through
-- raw_app_meta_data, which is writable only with the service role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, 'student'), '@', 1)
    ),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'student' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
