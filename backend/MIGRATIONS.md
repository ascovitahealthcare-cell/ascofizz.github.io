# Database migrations — what to run

These are SQL files. They change the database, and **nothing in this
repository can run them for you** — the app connects to Supabase but
never alters its own schema. Until you apply them, the fixes in the code
have nothing to talk to.

---

## Just do this

**Step 1 — open `RUN-ME-FIRST.sql`, copy all of it, paste it into
Supabase, press Run.**

1. Open [supabase.com](https://supabase.com) and sign in.
2. Pick your Supabase project.
3. Left sidebar → **SQL Editor** → **New query**.
4. Paste the whole file. Press **Run**.

That is 004, 006 and 007 joined into one paste, in the right order —
returns, VitaPoints and reviews, all three fixed in one go. Takes a few
seconds. Safe to run twice, so if you are unsure whether it went
through, just run it again.

When it finishes it prints one small table: customer accounts that
differ only in capitalisation — one person with two logins, orders split
between them. **Empty is the normal result.** If it has rows, send them
to me; merging two real accounts is a decision, not something a script
should guess at.

**Step 2 — check it worked.** Open this on your phone, no login needed:

```
<your-api-url>/api/health/db
```

`{"ok":true, ...}` means everything the code needs is present.
`{"ok":false, "missing":[...]}` names whatever is still absent.

**Step 3 — once the site is confirmed working, run
`005_rls_lockdown.sql` on its own.** It is security hardening rather
than a bug fix, and it is the one most likely to need a follow-up, so
keeping it separate means that if anything breaks you know which change
did it.

---

## What is in it, and why

`RUN-ME-FIRST.sql` is generated from the three files below. They stay in
the repository as the record of what each one does; you do not need to
run them separately.

| # | File | What breaks without it |
|---|------|------------------------|
| 1 | `004_returns_delivered_at.sql` | Return and refund requests. The return window is measured from delivery, and there was no delivery date column — so the window was counted from the order date and had usually closed before the parcel arrived. Every order came back "not eligible". |
| 2 | `006_vitapoints_v2.sql` | All of VitaPoints. The code calls fifteen database functions that no migration ever created, so orders earn nothing, cancelling reverses nothing, and the account page shows a zero balance with no error anywhere. Also fixes the coupon usage limit, which silently was not being enforced. |
| 3 | `007_normalise_emails.sql` | Reviews and returns for most customers. Email was stored in whatever case each person typed, and lookups matched exactly — so someone who registered as `Sister@Gmail.com` and checked out as `sister@gmail.com` had orders the site could not find. That is why reviews said "you can only review products you have purchased" to people who had, and why return requests answered "order not found". |
| 4 | `005_rls_lockdown.sql` | Nothing visible — this one is security. It turns on row-level security for every table and removes the public write access. **Run it last**, after you have confirmed the site still works, because it is the one most likely to need a follow-up if something was relying on that open access. |

`001_vita_points_schema 2.sql`, `002_atomic_counters.sql` and
`003_returns.sql` are older and should already be applied. Running them
again does no harm if you are unsure.

The `/api/health/db` report is also printed into the Render logs about
five seconds after every deploy, so you can read it there instead.

## Later migrations (008 onwards)

Migrations 008 through 018 were delivered and applied individually in
the audit sessions (waybill column, search-path fixes, RLS policies,
duplicate indexes, retention purge, `is_test` flag, VitaPoints lifetime
fix on reversals and more). Every one of them is a `CREATE IF NOT
EXISTS` / `ALTER` statement set, so re-running any of them is safe.

| # | File | What it adds |
|---|------|--------------|
| 19 | `migrations/019_staff_identities_2fa.sql` | The staff identity system: one login per person, TOTP 2FA secrets, backup codes, custom permission sets, and the owner-only 2FA master toggle settings keys. |

**019 — apply via Supabase SQL Editor** (or the Supabase MCP):

```sql
-- paste the whole of migrations/019_staff_identities_2fa.sql
```

It creates `auth_identities` (RLS deny-all on the client side — the
backend always uses the service key), indexes it on lower(username), and
inserts the two `2fa_*` settings keys next to the rest of the store
settings. On the next deploy the server upserts the built-in `owner` and
`admin` identities from the env passwords, so existing logins never
break — even before the migration is applied, login falls back to the
env passwords transparently.

## How this was checked

`RUN-ME-FIRST.sql` was applied to a throwaway PostgreSQL 16 database
built to match production before the fix — no `delivered_at` column, no
`vita_*` object of any kind, and orders filed under three different
capitalisations of two real addresses. Then twelve assertions confirmed
each reported bug is actually gone:

- an order delivered 4 days ago is returnable; one delivered 25 days ago
  is refused, and says why
- delivery dates backfilled from the status log
- an order earns points, they become spendable after the hold, spending
  them debits correctly, and cancelling returns both what was earned and
  what was spent
- both of one customer's differently-capitalised orders are found by a
  single exact lookup
- the coupon usage limit is enforced (it silently was not)
- the points ledger and the balance columns agree — no drift

Then the whole file was run a second time to confirm it changes nothing
on a re-run: no doubled points, no doubled coupon uses, no drift.
