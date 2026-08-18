-- ═══════════════════════════════════════════════════════════════
-- 007 — Normalise email casing
--
-- WHY
--   Email is the join key between customers, orders, returns, reviews
--   and VitaPoints, and nothing ever forced it to a single case.
--
--   signToken() puts `customer.email` — the stored row — into the JWT,
--   and /api/auth/email-login finds that row with .ilike(), so signing
--   in as "Sister@Gmail.com" against a row stored lowercase succeeds
--   and mints a mixed-case token. Checkout then filed the order under
--   whatever the checkout form said. Downstream, some lookups used
--   .eq() (exact, case-sensitive) and others .ilike(), so whether a
--   customer could see their own data depended on which route they hit.
--
--   Two reported bugs are exactly this:
--     • Reviews gate on "have you bought this?" with an .eq() on
--       customer_email. No case match, no orders found, no purchase —
--       403 "You can only review products you have purchased" shown to
--       people who had.
--     • Submitting a return looked the order up with .eq() on id AND
--       email, and returned "Order not found" for an order the customer
--       was looking straight at.
--
--   The application now lowercases every token identity and every order
--   it writes. This is the other half: the rows already stored.
--
-- SAFE TO RE-RUN. Read the SELECT at the bottom after applying.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ── 1. Customers ───────────────────────────────────────────────
-- Done first and most carefully: if two rows differ only by case then
-- lowercasing both collides, and if there is a unique index on email
-- the statement fails and takes the whole migration with it.
--
-- Rather than guess how to merge two accounts, this leaves any such
-- pair ALONE and reports them at the end for a human to look at.
-- Everything else is normalised.
update customers c
   set email = lower(btrim(c.email))
 where c.email is distinct from lower(btrim(c.email))
   and not exists (
     select 1 from customers other
      where other.id <> c.id
        and lower(btrim(other.email)) = lower(btrim(c.email))
   );

-- ── 2. Orders ──────────────────────────────────────────────────
-- No uniqueness on customer_email, so this is unconditional.
update orders
   set customer_email = lower(btrim(customer_email))
 where customer_email is distinct from lower(btrim(customer_email));

-- ── 3. Returns ─────────────────────────────────────────────────
update returns
   set customer_email = lower(btrim(customer_email))
 where customer_email is distinct from lower(btrim(customer_email));

-- ── 4. Reviews ─────────────────────────────────────────────────
-- The one-review-per-product check is (customer_email, product_id), so
-- a mixed-case row let the same person review a product twice. After
-- this they cannot — and any pair that already exists stays, because
-- deleting a customer's review is not a migration's decision to make.
update reviews
   set customer_email = lower(btrim(customer_email))
 where customer_email is distinct from lower(btrim(customer_email));

commit;

-- ── 5. What still needs a human ────────────────────────────────
-- Customer accounts that differ only by case. Each pair is two logins
-- over one real person, with their orders and points split between
-- them. Merge or delete deliberately; this migration will not.
select lower(btrim(email)) as address,
       count(*)            as accounts,
       array_agg(id order by id)    as ids,
       array_agg(email order by id) as spellings
  from customers
 group by lower(btrim(email))
having count(*) > 1
 order by 1;

-- ── 6. Verify ──────────────────────────────────────────────────
--   Every count below should be 0.
--
--   select count(*) from orders  where customer_email <> lower(btrim(customer_email));
--   select count(*) from returns where customer_email <> lower(btrim(customer_email));
--   select count(*) from reviews where customer_email <> lower(btrim(customer_email));
--
--   Orders that no longer match any customer row would mean something
--   went wrong — expect 0:
--
--   select count(*) from orders o
--    where o.customer_email is not null
--      and not exists (select 1 from customers c where c.email = o.customer_email);
