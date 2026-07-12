-- Installment forward-liability sync (M2). Populates `installment_plans`
-- from transactions carrying `installment_number`/`installment_total`
-- (scraped with combineInstallments:false per the plan, so each monthly
-- charge is its own transaction row). Groups transactions by
-- (account_id, description, installment_total) as the natural key for
-- "same installment plan" -- transaction ids are already deduped
-- per-occurrence, so there's no better stable identifier available.
--
-- monthly_amount/total_amount are stored as POSITIVE magnitudes
-- (abs(charged_amount)), not the signed convention used elsewhere in
-- `transactions` -- these columns feed `v_net_worth.remaining_installment_
-- liability`, which is subtracted from net worth as a positive amount owed.
--
-- monthly_amount is taken from the occurrence with the HIGHEST
-- installment_number seen so far (the most recent charge) rather than
-- an arbitrary row -- if a provider ever revises a plan's amount
-- mid-cycle, the latest charge is the more trustworthy figure. In the
-- expected case (all occurrences agree), this is a no-op distinction.
--
-- origin_transaction_id is the EARLIEST transaction in the group by
-- date, not necessarily installment_number=1 -- a first-run backfill
-- window can start mid-plan (installment #1 scraped before the
-- configured start-date), so "earliest we've seen" is the only
-- available anchor. When a new sync discovers an earlier transaction
-- while the current origin still exists, the row is updated in-place via
-- ON CONFLICT DO UPDATE (id stable). However, if the origin transaction
-- itself is ever deleted (e.g., via reconciliation), ON DELETE CASCADE
-- immediately removes the installment_plans row; the next sync then
-- inserts a new row with a new id, updating origin_transaction_id to
-- the remaining earliest transaction. The final column values are correct
-- either way, but callers should not assume installment_plans.id is
-- stable across the origin transaction's lifetime. A brief disappearance
-- from v_net_worth liability calculations can occur if the origin txn
-- is deleted between syncs (self-heals on next sync, not data loss).
--
-- KNOWN LIMITATION: unverified against real data as of this migration.
-- Zero real installment transactions exist in the live Max data (56
-- real transactions, 0 with installment_total set) -- this logic is
-- proven only against synthetic fixtures inserted/cleaned up via the
-- Supabase MCP (see this migration's accompanying plan task). The
-- first real installment purchase is the actual proof.
create unique index if not exists installment_plans_account_desc_total_idx
  on installment_plans (account_id, merchant_description, total_count);

create or replace function public.sync_installment_plans(p_household_id uuid)
returns integer
language plpgsql
as $$
declare
  v_group record;
  v_origin_id uuid;
  v_synced_count integer := 0;
begin
  for v_group in
    select account_id, description, installment_total,
           max(installment_number) as max_installment_number,
           (array_agg(abs(charged_amount) order by installment_number desc nulls last))[1] as latest_amount
    from transactions
    where household_id = p_household_id
      and installment_total is not null
    group by account_id, description, installment_total
  loop
    select id into v_origin_id
    from transactions
    where household_id = p_household_id
      and account_id = v_group.account_id
      and description = v_group.description
      and installment_total = v_group.installment_total
    order by date asc
    limit 1;

    insert into installment_plans (
      household_id, origin_transaction_id, account_id, merchant_description,
      total_amount, total_count, monthly_amount, remaining_count
    )
    values (
      p_household_id, v_origin_id, v_group.account_id, v_group.description,
      v_group.latest_amount * v_group.installment_total, v_group.installment_total,
      v_group.latest_amount, greatest(v_group.installment_total - v_group.max_installment_number, 0)
    )
    on conflict (account_id, merchant_description, total_count)
    do update set
      origin_transaction_id = excluded.origin_transaction_id,
      total_amount = excluded.total_amount,
      monthly_amount = excluded.monthly_amount,
      remaining_count = excluded.remaining_count,
      updated_at = now();

    v_synced_count := v_synced_count + 1;
  end loop;

  return v_synced_count;
end;
$$;

-- Agent-only: called from the ingest pipeline right after apply_rules,
-- using the service-role key (which bypasses grants entirely). The web
-- app reads `installment_plans` directly via a normal RLS-scoped
-- select (already covered by the household RLS policy loop in the
-- initial migration) -- no web use case for calling this function.
revoke execute on function public.sync_installment_plans(uuid) from public, anon, authenticated;
