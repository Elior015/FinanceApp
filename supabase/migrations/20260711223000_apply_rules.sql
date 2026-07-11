-- Rule engine application (M1). Iterates `rules` in priority order and,
-- for each active rule, updates every transaction still at
-- categorization_source='none' whose fields satisfy ALL of the
-- conditions present in that rule's `conditions` jsonb (a condition key
-- that's absent is treated as "don't filter on this" — not "must be
-- null"). Supported conditions: merchant_contains (case-insensitive
-- substring), merchant_regex (case-insensitive regex), amount_min/
-- amount_max (against charged_amount, which is signed — negative for
-- money out), account_ids (array of uuids), direction ('debit'|
-- 'credit', also against charged_amount's sign).
--
-- Supported actions: category_id, add_tags, set_personal,
-- exclude_from_totals. `display_name` from the plan's action set is
-- deliberately NOT implemented here — it's a merchant_map concern
-- (English display names for Hebrew merchants), which is explicitly
-- M2 scope, not M1's rule engine.
--
-- `stop_processing` controls whether a match claims the transaction
-- (categorization_source → 'rule', applied_rule_id set, so it's
-- excluded from every later rule in this same pass and from future
-- calls) or just applies its actions and leaves categorization_source
-- untouched so a later, more specific rule can still claim it — e.g. a
-- low-priority "tag all Isracard txns as shared-card" rule that
-- shouldn't prevent a more specific merchant rule from also setting
-- the category.
--
-- Never touches rows where categorization_source is already 'manual'
-- (or 'rule'/'merchant_map'/'llm' from a prior pass) — the where
-- clause only ever selects 'none' rows, which is what encodes the
-- manual > rule > merchant_map > llm > none precedence from the plan.
create or replace function public.apply_rules(p_household_id uuid)
returns integer
language plpgsql
as $$
declare
  v_rule record;
  v_new_tags text[];
  v_updated integer;
  v_total_updated integer := 0;
begin
  for v_rule in
    select id, conditions, actions, stop_processing
    from rules
    where household_id = p_household_id
      and is_active = true
    order by priority
  loop
    v_new_tags := case
      when v_rule.actions->'add_tags' is not null
        then array(select jsonb_array_elements_text(v_rule.actions->'add_tags'))
      else array[]::text[]
    end;

    update transactions t
    set category_id = coalesce((v_rule.actions->>'category_id')::uuid, t.category_id),
        tags = case
          when array_length(v_new_tags, 1) is not null
            then (select array_agg(x) from (select distinct unnest(t.tags || v_new_tags) as x) s)
          else t.tags
        end,
        is_personal = coalesce((v_rule.actions->>'set_personal')::boolean, t.is_personal),
        exclude_from_totals = coalesce((v_rule.actions->>'exclude_from_totals')::boolean, t.exclude_from_totals),
        categorization_source = case when v_rule.stop_processing then 'rule' else t.categorization_source end,
        applied_rule_id = case when v_rule.stop_processing then v_rule.id else t.applied_rule_id end,
        updated_at = now()
    where t.household_id = p_household_id
      and t.categorization_source = 'none'
      and (v_rule.conditions->>'merchant_contains' is null
           or t.description ilike '%' || (v_rule.conditions->>'merchant_contains') || '%')
      and (v_rule.conditions->>'merchant_regex' is null
           or t.description ~* (v_rule.conditions->>'merchant_regex'))
      and (v_rule.conditions->>'amount_min' is null
           or t.charged_amount >= (v_rule.conditions->>'amount_min')::numeric)
      and (v_rule.conditions->>'amount_max' is null
           or t.charged_amount <= (v_rule.conditions->>'amount_max')::numeric)
      and (v_rule.conditions->'account_ids' is null
           or t.account_id::text in (select jsonb_array_elements_text(v_rule.conditions->'account_ids')))
      and (v_rule.conditions->>'direction' is null
           or (v_rule.conditions->>'direction' = 'debit' and t.charged_amount < 0)
           or (v_rule.conditions->>'direction' = 'credit' and t.charged_amount > 0));

    get diagnostics v_updated = row_count;
    v_total_updated := v_total_updated + v_updated;
  end loop;

  return v_total_updated;
end;
$$;

-- Unlike resolve_pending_transactions, this one IS meant to be callable
-- from the web app (e.g. an "apply to existing transactions" action
-- after creating/editing a rule) — RLS on the `transactions`/`rules`
-- tables still constrains it to the caller's own household regardless
-- of what p_household_id is passed, since this function is plain
-- SECURITY INVOKER (the default), not SECURITY DEFINER.
revoke execute on function public.apply_rules(uuid) from public, anon;
grant execute on function public.apply_rules(uuid) to authenticated;
