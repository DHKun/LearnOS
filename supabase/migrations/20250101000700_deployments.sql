-- Minimal single-host deployment records.
--
-- The Updater container owns job execution. Both the Next.js admin API and the
-- Updater use the service role, so these tables intentionally have no browser
-- policies: students must never see deployment state or build logs.

create table public.deployment_jobs (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null default 'deploy' check (kind in ('deploy', 'rollback')),
  status                text not null default 'queued' check (
                          status in (
                            'queued', 'validating', 'building', 'syncing',
                            'switching', 'health_check', 'rolling_back',
                            'succeeded', 'failed', 'rolled_back'
                          )
                        ),
  phase                 text,
  deployment_version    text not null check (deployment_version ~ '^[0-9]{4}\.[0-9]{2}\.[0-9]{2}-[0-9]{2}$'),
  image_tag             text,
  image_id              text,
  previous_version      text,
  previous_image_id     text,
  rollback_target_job_id uuid references public.deployment_jobs (id) on delete set null,
  requested_by          uuid references public.profiles (user_id) on delete set null,
  courses               jsonb not null default '[]'::jsonb check (jsonb_typeof(courses) = 'array'),
  result                jsonb not null default '{}'::jsonb,
  logs                  jsonb not null default '[]'::jsonb check (jsonb_typeof(logs) = 'array'),
  error                 text,
  created_at            timestamptz not null default now(),
  started_at            timestamptz,
  finished_at           timestamptz,
  heartbeat_at          timestamptz
);

-- At most one active deployment or rollback. This makes double-clicks and two
-- admin tabs safe without an external lock service.
create unique index deployment_jobs_one_active
  on public.deployment_jobs ((true))
  where status in (
    'queued', 'validating', 'building', 'syncing',
    'switching', 'health_check', 'rolling_back'
  );

create index deployment_jobs_created_idx on public.deployment_jobs (created_at desc);
create index deployment_jobs_status_idx on public.deployment_jobs (status);

create table public.deployment_state (
  id                boolean primary key default true check (id),
  current_job_id    uuid references public.deployment_jobs (id) on delete set null,
  previous_job_id   uuid references public.deployment_jobs (id) on delete set null,
  current_version   text,
  previous_version  text,
  current_image_id  text,
  previous_image_id text,
  updated_at        timestamptz not null default now()
);

insert into public.deployment_state (id) values (true) on conflict (id) do nothing;

alter table public.deployment_jobs enable row level security;
alter table public.deployment_state enable row level security;

-- Browser roles get nothing. Admin API routes authorise the caller and then
-- use the service-role client.
revoke all on public.deployment_jobs, public.deployment_state from anon, authenticated;
grant all on public.deployment_jobs, public.deployment_state to service_role;

-- ---------------------------------------------------------------------------
-- Updater helpers
-- ---------------------------------------------------------------------------

create or replace function public.claim_deployment_job()
returns setof public.deployment_jobs
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.append_deployment_log(
  p_job uuid,
  p_level text,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.promote_deployment(
  p_job uuid,
  p_image_id text,
  p_image_tag text,
  p_result jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.promote_rollback(
  p_job uuid,
  p_target_job uuid,
  p_image_id text,
  p_image_tag text,
  p_result jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.finish_deployment_failure(
  p_job uuid,
  p_status text,
  p_error text,
  p_result jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.claim_deployment_job() from public, anon, authenticated;
revoke all on function public.append_deployment_log(uuid, text, text) from public, anon, authenticated;
revoke all on function public.promote_deployment(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.promote_rollback(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_deployment_failure(uuid, text, text, jsonb) from public, anon, authenticated;

grant execute on function public.claim_deployment_job() to service_role;
grant execute on function public.append_deployment_log(uuid, text, text) to service_role;
grant execute on function public.promote_deployment(uuid, text, text, jsonb) to service_role;
grant execute on function public.promote_rollback(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.finish_deployment_failure(uuid, text, text, jsonb) to service_role;

comment on table public.deployment_jobs is 'Single-host Docker Compose deployment and rollback jobs.';
comment on table public.deployment_state is 'Current and previous successful LearnOS image references.';

notify pgrst, 'reload schema';
