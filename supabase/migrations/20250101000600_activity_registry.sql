-- Migrate interactive lessons from the isolated iframe labs to the in-app
-- React activity registry. Course IDs, lesson IDs and all learning records are
-- preserved; only the interactive lesson config changes.

alter table public.lessons
  drop constraint if exists lessons_content_shape;

update public.lessons
set config = (config - 'entryUrl')
  || jsonb_build_object(
       'activityId',
       coalesce(nullif(config ->> 'activityId', ''), nullif(config ->> 'validatorId', ''))
     )
where type = 'interactive';

do $$
begin
  if exists (
    select 1 from public.lessons
    where type = 'interactive'
      and nullif(config ->> 'activityId', '') is null
  ) then
    raise exception '互动章节缺少 activityId，无法完成迁移';
  end if;
end;
$$;

alter table public.lessons
  add constraint lessons_content_shape check (
    (type = 'interactive' and nullif(config ->> 'activityId', '') is not null)
    or (type in ('article', 'quiz') and content_ref is not null)
  );
