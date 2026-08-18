-- ═══════════════════════════════════════════════════════════════════════
-- 022 — restore the unique constraint on vita_pending.order_id
--
-- THE BUG
--   On a database built from these migrations in order, the VitaPoints
--   earn path is dead. vita_earn_on_order() (006) inserts with
--
--     insert into vita_pending (...) values (...) on conflict (order_id) do nothing
--
--   and ON CONFLICT requires a unique index on order_id. Three migrations
--   interact to remove it:
--
--     006 creates vita_pending WITHOUT `unique` on order_id, then adds
--         `create unique index vita_pending_order_idx on vita_pending (order_id)`.
--     014 drops vita_pending_order_idx, on the stated grounds that it
--         duplicates `vita_pending_order_id_key`.
--     …but nothing ever creates vita_pending_order_id_key. It existed only
--         on the original hand-built production database, where the table
--         had been declared with `order_id text unique` — which is what
--         auto-generates that constraint name.
--
--   So on production 014 was a genuine de-duplication, and on any fresh
--   install it deletes the only unique index and takes the loyalty scheme
--   with it. Every order then fails to earn points with
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification" — inside a function whose caller swallows the error,
--   so nothing surfaces anywhere.
--
-- THE FIX
--   Add the constraint under the exact name 014 expects, so the two agree
--   and re-running 014 stays a no-op. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

do $$
begin
  if to_regclass('public.vita_pending') is null then
    raise notice 'vita_pending does not exist — run 006_vitapoints_v2.sql first. Nothing to do.';
    return;
  end if;

  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.vita_pending'::regclass
       and conname  = 'vita_pending_order_id_key'
  ) then
    raise notice 'vita_pending_order_id_key already present — nothing to do.';
    return;
  end if;

  -- A duplicate order_id would make the constraint impossible to add. That
  -- can only have come from rows written while the index was missing, so
  -- collapse each order to its earliest row before adding it.
  delete from public.vita_pending a
   using public.vita_pending b
   where a.order_id = b.order_id
     and a.id > b.id;

  alter table public.vita_pending
    add constraint vita_pending_order_id_key unique (order_id);

  raise notice 'vita_pending_order_id_key added — VitaPoints earn path restored.';
end $$;

-- Verify: vita_earn_on_order's ON CONFLICT target must now resolve.
do $$
begin
  if not exists (
    select 1 from pg_indexes
     where tablename = 'vita_pending'
       and indexdef ilike '%UNIQUE%'
       and indexdef ilike '%(order_id)%'
  ) then
    raise warning 'STILL BROKEN — no unique index on vita_pending(order_id); VitaPoints will not earn.';
  else
    raise notice 'OK — unique index on vita_pending(order_id) present.';
  end if;
end $$;
