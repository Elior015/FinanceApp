-- Approved by user: household_signup_allowlist gates who can create an
-- auth account. It should never be reachable via the anon/authenticated
-- PostgREST API in either direction -- only the agent's service-role
-- key (which bypasses RLS) manages it, via seed.sql / direct SQL.
alter table public.household_signup_allowlist enable row level security;
