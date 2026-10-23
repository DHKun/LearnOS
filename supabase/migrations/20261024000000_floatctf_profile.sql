-- FloatCTF OIDC users arrive without email (the ID Token intentionally carries
-- only minimal identity claims). Keep profiles student-only and derive a
-- readable display name from safe provider metadata when available.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text;
begin
  v_display_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    case
      when nullif(new.raw_user_meta_data ->> 'sub', '') is not null
        then 'FloatCTF 用户 ' || left(new.raw_user_meta_data ->> 'sub', 8)
      else split_part(coalesce(new.email, 'student'), '@', 1)
    end
  );

  insert into public.profiles (user_id, email, display_name, role)
  values (
    new.id,
    new.email,
    left(v_display_name, 120),
    case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'student' end
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;
