-- Admission policy: public signup endpoints may only create accounts through
-- the FloatCTF custom OIDC provider. Administrator-created accounts use the
-- Supabase Admin API, which does not run the before-user-created hook.
--
-- The hook input shape is the GoTrue v0 before-user-created payload:
--   { "user": { "app_metadata": { "provider": "custom:floatctf" }, ... }, ... }

create or replace function public.before_user_created_floatctf(input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  provider text := input #>> '{user,app_metadata,provider}';
begin
  if provider in ('custom:floatctf', 'keycloak') then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'LearnOS 账号由管理员发放，或使用 FloatCTF 登录',
      'http_code', 403
    )
  );
end;
$$;

revoke all on function public.before_user_created_floatctf(jsonb) from public;
grant execute on function public.before_user_created_floatctf(jsonb) to supabase_auth_admin;
