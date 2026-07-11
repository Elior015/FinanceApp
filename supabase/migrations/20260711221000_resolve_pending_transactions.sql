-- Pending → completed resolution (M1). A scraper often reports a
-- transaction as `pending` first, then a few days later reports the
-- "same" real-world event as `completed` with a slightly different
-- date/amount — which means a different dedup_hash, so the plain
-- upsert step leaves TWO rows (the untouched original pending row +
-- a freshly inserted completed duplicate) instead of merging them.
-- This function finds those pairs and merges them, preserving the
-- pending row's id/category_id/tags/notes (so any manual edit made
-- while a transaction was still pending survives the transition) and
-- discarding the duplicate.
--
-- Matching predicate: same account, amount within ±0.5%, date within
-- ±4 days, identical description. Description is matched exactly
-- (not fuzzily) because in practice banks don't reword the merchant
-- string between pending and completed reports; this can be loosened
-- later (e.g. pg_trgm similarity) if real data proves otherwise.
--
-- Implemented as a loop rather than a set-based query because each
-- merge must delete its duplicate row before the next pending row is
-- considered — otherwise two different pending rows could both try
-- to claim the same completed duplicate as their match.
create or replace function public.resolve_pending_transactions(p_household_id uuid)
returns integer
language plpgsql
as $$
declare
  v_pending record;
  v_match record;
  v_resolved_count integer := 0;
begin
  for v_pending in
    select id, account_id, charged_amount, date, description
    from transactions
    where household_id = p_household_id
      and status = 'pending'
    order by date
  loop
    select t.id, t.date, t.processed_date, t.charged_amount, t.charged_currency,
           t.original_amount, t.original_currency, t.description, t.memo,
           t.txn_type, t.installment_number, t.installment_total,
           t.provider_identifier, t.dedup_hash, t.raw
    into v_match
    from transactions t
    where t.household_id = p_household_id
      and t.account_id = v_pending.account_id
      and t.status = 'completed'
      and t.id <> v_pending.id
      and t.description = v_pending.description
      and t.date between v_pending.date - 4 and v_pending.date + 4
      and abs(t.charged_amount - v_pending.charged_amount) <= abs(v_pending.charged_amount) * 0.005
    order by abs(t.date - v_pending.date)
    limit 1;

    if found then
      -- Delete the duplicate first: updating the pending row's
      -- dedup_hash to match it while both rows still exist would
      -- collide with the unique index (account_id, dedup_hash).
      delete from transactions where id = v_match.id;

      update transactions
      set status = 'completed',
          date = v_match.date,
          processed_date = v_match.processed_date,
          charged_amount = v_match.charged_amount,
          charged_currency = v_match.charged_currency,
          original_amount = v_match.original_amount,
          original_currency = v_match.original_currency,
          description = v_match.description,
          memo = v_match.memo,
          txn_type = v_match.txn_type,
          installment_number = v_match.installment_number,
          installment_total = v_match.installment_total,
          provider_identifier = v_match.provider_identifier,
          dedup_hash = v_match.dedup_hash,
          raw = v_match.raw,
          updated_at = now()
      where id = v_pending.id;

      v_resolved_count := v_resolved_count + 1;
    end if;
  end loop;

  return v_resolved_count;
end;
$$;

-- Agent-only: called from the ingest pipeline right after the batched
-- upsert, using the service-role key (which bypasses grants entirely).
-- No web-app use case for this one, unlike apply_rules.
revoke execute on function public.resolve_pending_transactions(uuid) from public, anon, authenticated;
