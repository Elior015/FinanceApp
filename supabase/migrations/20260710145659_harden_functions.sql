-- Security hardening from the post-migration advisor pass:
-- 1. set_updated_at() had a mutable search_path (linter: function_search_path_mutable).
-- 2. enforce_signup_allowlist() is a trigger-only function that should
--    never be called directly via PostgREST's RPC exposure — revoking
--    EXECUTE from PUBLIC doesn't affect the trigger itself (trigger
--    firing doesn't go through the caller's function-EXECUTE grant).
-- 3. is_member() still needs EXECUTE for `authenticated` (RLS policies
--    evaluate it as the querying role), but anon never needs it since
--    every policy is already scoped `to authenticated` — anon queries
--    never reach a policy that would call this function at all.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.enforce_signup_allowlist() from public;

revoke execute on function public.is_member(uuid) from anon;
