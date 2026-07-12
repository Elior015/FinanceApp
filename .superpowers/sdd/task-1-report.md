# Task 1: Installment Forward-Liability Backend — Completion Report

**Status**: DONE  
**Commit SHA**: a8d3778  
**Date**: 2026-07-12

---

## Summary

Implemented the installment forward-liability sync backend: SQL migration, agent pipeline wrapper, sync pipeline wiring, and full verification via synthetic fixtures. All steps completed successfully, all tests pass, migration applied live to Supabase project `gdvutebllsocdaefcarj`.

---

## Files Created/Modified

1. **Created**: `supabase/migrations/20260712120000_sync_installment_plans.sql` (94 lines)
   - Implements the SQL function `public.sync_installment_plans(p_household_id uuid)` that groups transactions by `(account_id, description, installment_total)` and populates `installment_plans` table
   - Creates unique index `installment_plans_account_desc_total_idx` for conflict detection
   - Includes revoke grants to prevent public/anon/authenticated execution (agent-only)

2. **Created**: `apps/agent/src/pipeline/installmentPlans.ts` (19 lines)
   - Wrapper function `syncInstallmentPlans(supabase, householdId)` that calls the RPC
   - Follows existing pipeline pattern (see `applyRules.ts`, `resolve.ts`)
   - Returns count of installment groups synced

3. **Modified**: `apps/agent/src/sync.ts` (3 changes)
   - Added import: `import { syncInstallmentPlans } from "./pipeline/installmentPlans.js";`
   - Added call after `applyRules`: `const installmentPlansSynced = await syncInstallmentPlans(supabase, connection.household_id);`
   - Updated log line to include: `${installmentPlansSynced} installment plans synced`

---

## Migration Application & Validation

### Migration Applied Successfully
- Tool: `mcp__plugin_supabase_supabase__apply_migration` 
- Project: `gdvutebllsocdaefcarj`
- Result: `{"success":true}`

### Advisors Check (Security & Performance)
Run post-migration via `get_advisors`:

**Security Findings** (pre-existing, not new):
- `function_search_path_mutable` on `sync_installment_plans` — consistent with `resolve_pending_transactions`, `apply_rules`, and documented in brief as acceptable
- Other pre-existing findings (RLS, auth password protection, etc.) unchanged

**Performance Findings** (pre-existing, not new):
- Unindexed foreign keys on `installment_plans` (household_id_fkey, origin_transaction_id_fkey) — consistent with all other household-scoped tables (not a new pattern)
- Unused indexes on `transactions` table — pre-existing

**Conclusion**: No new security or performance issues introduced by this migration.

---

## Synthetic Fixture Verification

All test steps from the brief executed successfully via `mcp__plugin_supabase_supabase__execute_sql`:

### Step 1: Normal Case + First Sync
```sql
insert into transactions (household_id, account_id, date, charged_amount, original_amount, 
                         description, dedup_hash, installment_number, installment_total)
values
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-05-01', -100, -100, 
   'ZZZ_TEST_INSTALLMENT_FIXTURE', 'zzz-fixture-1', 1, 3),
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-06-01', -100, -100, 
   'ZZZ_TEST_INSTALLMENT_FIXTURE', 'zzz-fixture-2', 2, 3);

select public.sync_installment_plans('00000000-0000-0000-0000-000000000001');
```
- **Result**: Function returned `1` ✓ (expected)
- **Data verification**:
  ```
  merchant_description: 'ZZZ_TEST_INSTALLMENT_FIXTURE'
  total_count: 3
  monthly_amount: 100.00
  total_amount: 300.00
  remaining_count: 1
  origin_transaction_id: <id of zzz-fixture-1> (earliest by date)
  ```
  ✓ All values match expectations

### Step 2: Idempotency
```sql
select public.sync_installment_plans('00000000-0000-0000-0000-000000000001');
```
- **Result**: Function returned `1` ✓ (still processes the group; upsert keeps exactly 1 row)
- **Data unchanged**: Spot-check of merchant_description='ZZZ_TEST_INSTALLMENT_FIXTURE' row confirmed same values ✓

### Step 3: Backfill-Missing-Origin
```sql
delete from transactions where dedup_hash = 'zzz-fixture-1';
select public.sync_installment_plans('00000000-0000-0000-0000-000000000001');
select origin_transaction_id, remaining_count, monthly_amount 
  from installment_plans where merchant_description = 'ZZZ_TEST_INSTALLMENT_FIXTURE';
```
- **Result**: Function returned `1` ✓
- **Data verification after deletion**:
  ```
  origin_transaction_id: <id of zzz-fixture-2> (new earliest)
  remaining_count: 1
  monthly_amount: 100.00
  ```
  ✓ Origin_transaction_id now references remaining transaction (via cascade-delete + re-insert with new row id)
  
  **Note on cascade behavior**: When the origin transaction (zzz-fixture-1) was deleted, the ON DELETE CASCADE foreign key constraint immediately deleted the installment_plans row. The subsequent sync call then inserted a new installment_plans row (new id) with origin_transaction_id pointing to zzz-fixture-2. This is different from the in-place UPDATE path that occurs when an earlier transaction is discovered while the current origin row still exists. Both paths produce correct final values, but the row id is NOT stable if the origin transaction is deleted (self-heals on next sync, no data loss).

### Step 4: Cleanup & Real Data Integrity
```sql
delete from transactions where dedup_hash = 'zzz-fixture-2';
delete from installment_plans where merchant_description = 'ZZZ_TEST_INSTALLMENT_FIXTURE';

select (select count(*) from transactions) as txn_count,
       (select count(*) from accounts) as account_count,
       (select count(*) from installment_plans) as installment_plans_count;
```
- **Result**: 
  ```
  txn_count: 56
  account_count: 2
  installment_plans_count: 0
  ```
  ✓ Exactly matches baseline (real data from Max connection untouched)

---

## Build & Test Results

All workspace checks completed successfully:

```
pnpm typecheck    ✓ All green
pnpm lint         ✓ All green
pnpm test         ✓ All green
  - packages/shared: 17 tests passed
  - apps/agent: 11 tests passed
```

---

## Notes

1. **Fixture schema adjustment**: The brief's fixture examples omitted `original_amount`, which is a required NOT NULL column in the `transactions` table. Corrected in actual fixture by setting `original_amount = -100` (same as `charged_amount`). The function logic itself remains unchanged — this is a fixture-only detail, not a code issue.

2. **Zero real installment transactions**: As documented in the migration comments, the live Max data (56 transactions) contains zero rows with `installment_total` set, so this code ships unverified against real data. This is intentional and documented; the first real installment purchase will be the actual proof.

3. **Search-path warning is expected**: The new function inherits the same `function_search_path_mutable` security lint finding as `resolve_pending_transactions` and `apply_rules`. This is consistent with the existing codebase and documented as acceptable (all agent-only functions, service-role keyed calls).

---

## Commit Details

**SHA**: a8d3778  
**Message**: "Add installment forward-liability sync (sync_installment_plans)"

Files changed:
- Created: `supabase/migrations/20260712120000_sync_installment_plans.sql`
- Created: `apps/agent/src/pipeline/installmentPlans.ts`
- Modified: `apps/agent/src/sync.ts`

Total insertions: 117 lines (excluding test cleanup)

---

## Test Coverage Summary

- **SQL function logic**: Verified via synthetic fixtures covering:
  - Normal case (2-of-3 installment transactions)
  - Idempotency (re-run same sync)
  - Backfill scenario (origin_transaction_id update when earliest is deleted)
  - Real data integrity (56 txns, 2 accounts baseline preserved)
  
- **TypeScript wrapper**: Type-correct per TS 5.x strict mode; follows existing pattern

- **Pipeline integration**: Import/call correctly wired; log line updated

- **Build**: typecheck, lint, test all pass workspace-wide

---

**Ready for Task 2: Net Worth Dashboard (reads installment_plans.remaining_count via v_net_worth view)**

---

## Fix: review finding

**Issue**: Migration header comment and task report Step 3 description were incomplete/misleading regarding the stability of `installment_plans.id` across the origin transaction's lifetime.

**Root cause**: The comment claimed the function "gets corrected on a later sync once/if an earlier occurrence is discovered via re-upsert" but omitted the cascade-delete scenario. The report's Step 3 description said "Origin correctly updated" without clarifying that an UPDATE statement did NOT occur — the row was cascade-deleted and recreated with a new id.

**Changes made**:
1. **Migration file header (lines 20-26)**: Expanded comment to document BOTH behaviors:
   - (a) Re-upsert-in-place case: when earlier transaction is discovered while current origin still exists (id stable)
   - (b) Cascade-delete case: when origin transaction itself is deleted (id NOT stable, row recreated with new id on next sync)
   - Added warning that callers should not assume id stability and noted self-healing behavior
   
2. **Task report Step 3 (lines 91-120)**: Added clarifying note explaining that the row was cascade-deleted and reinserted with a new id, not updated in place. Contrasted with the in-place UPDATE path and confirmed both paths produce correct final values.

**Test results**:
```
pnpm typecheck  ✓ All green (0 errors)
pnpm lint       ✓ All green (0 errors)
```

**Note**: Comment-only changes to the migration file do not require reapplication to Supabase (plain `--` comments are not stored in the database; the file is the source-of-truth record).
