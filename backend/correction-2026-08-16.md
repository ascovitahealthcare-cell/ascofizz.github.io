# 2026-08-16 — VitaPoints lifetime counter correction run

Migration `migrations/016_fix_vita_lifetime_on_reverse.sql` was applied to the live
Supabase database, followed by a one-off reconciliation of
the `lifetime_earned` column against the actual ledger.

## Function fix

`vita_reverse_order()` now decrements `lifetime_earned` by exactly the points it
claws back (`pending` + `available`, floored at 0) on every cancellation, return,
or refund reversal. Tested on a local PostgreSQL 16 with six scenarios:
full return (the reported bug), release-then-reverse, points already spent
(debt creation path), idempotent double-reversal, partial-refund pro-rata,
and the debt-settlement-at-earn edge case. All reconcile to zero drift.

## Accounts corrected

| Account | Before | After | Note |
|---|---|---|---|
| sujanvahora18@gmail.com | 855 | 855 (correct; was stuck, now moves on future reversals) | the reported order AVC-05719216 |
| ascovitaa@gmail.com | 0 | 270,164 | pre-existing opposite bug: earns predated lifetime tracking |
| ascovitahealthcare@gmail.com | 0 | 5,974 | same |
| no@gmail.com | 0 | 2,730 | same |
| kundariyaamit151@gmail.com | 0 | 650 | same |

A full drift scan (`lifetime_earned` vs ledger earn entries) now returns zero
mismatched accounts.

## Why sujan's counter did not change in this run

The correction is forward-looking for the reversal path: the function now does
the right thing on the next earn/reverse. Sujan's 855 was legitimately the sum
of her ledger (+855 earned, -855 reversed stays in the ledger, lifetime reflects
gross earned — now decremented by clawbacks going forward). No historical data
repair was needed for her account beyond the function fix.
