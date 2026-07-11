-- The first pass revoked from PUBLIC only. Supabase's default
-- privileges grant EXECUTE directly to anon/authenticated on every
-- new public-schema function (separate from PUBLIC's own grant), so
-- those direct grants needed to be revoked explicitly too.

revoke execute on function public.enforce_signup_allowlist() from anon, authenticated;
revoke execute on function public.is_member(uuid) from public;
