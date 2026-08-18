-- 011: Security Advisor lint 0011 — Function Search Path Mutable.
-- Generated from live overload inventory; one statement per signature.
-- vita_commit_redemption included (flagged in the same lint class).

ALTER FUNCTION public.approve_return(p_return_id uuid, p_actor text, p_note text) SET search_path = public;
ALTER FUNCTION public.claim_coupon_use(p_code text) SET search_path = public;
ALTER FUNCTION public.decrement_stock(p_id bigint, p_qty integer) SET search_path = public;
ALTER FUNCTION public.decrement_stock_strict(p_id bigint, p_qty integer) SET search_path = public;
ALTER FUNCTION public.fn_auto_coupon_usage() SET search_path = public;
ALTER FUNCTION public.fn_auto_log_order_status() SET search_path = public;
ALTER FUNCTION public.fn_prevent_negative_stock() SET search_path = public;
ALTER FUNCTION public.fn_set_updated_at() SET search_path = public;
ALTER FUNCTION public.fn_sync_order_status() SET search_path = public;
ALTER FUNCTION public.fn_update_customer_stats() SET search_path = public;
ALTER FUNCTION public.get_dashboard_kpis() SET search_path = public;
ALTER FUNCTION public.increment_coupon_use(p_code text) SET search_path = public;
ALTER FUNCTION public.purge_soft_deletes(p_days_old integer) SET search_path = public;
ALTER FUNCTION public.reject_return(p_return_id uuid, p_actor text, p_note text) SET search_path = public;
ALTER FUNCTION public.return_eligibility(p_order_id text) SET search_path = public;
ALTER FUNCTION public.validate_coupon(p_code text, p_order_value numeric) SET search_path = public;
ALTER FUNCTION public.vita_account_ensure(p_user text) SET search_path = public;
ALTER FUNCTION public.vita_award(p_user_id text, p_points integer, p_order_id text, p_hold_days integer) SET search_path = public;
ALTER FUNCTION public.vita_cfg(p_key text, p_default numeric) SET search_path = public;
ALTER FUNCTION public.vita_claim_milestone(p_user text) SET search_path = public;
ALTER FUNCTION public.vita_clamp_negative(p_email text, p_actor text) SET search_path = public;
ALTER FUNCTION public.vita_commit_redemption(p_order text) SET search_path = public;
ALTER FUNCTION public.vita_earn_on_order(p_user text, p_order text, p_eligible_value numeric, p_key text) SET search_path = public;
ALTER FUNCTION public.vita_expire_due() SET search_path = public;
ALTER FUNCTION public.vita_ledger_immutable() SET search_path = public;
ALTER FUNCTION public.vita_mark_delivered(p_order text, p_delivered_at timestamp with time zone) SET search_path = public;
ALTER FUNCTION public.vita_milestone_discount(p_lowest_item_price numeric, p_cart_total numeric) SET search_path = public;
ALTER FUNCTION public.vita_redeem(p_user_id text, p_points integer, p_order_id text) SET search_path = public;
ALTER FUNCTION public.vita_refund_redemption(p_order text, p_reason text) SET search_path = public;
ALTER FUNCTION public.vita_release_due() SET search_path = public;
ALTER FUNCTION public.vita_release_redemption(p_order text, p_reason text) SET search_path = public;
ALTER FUNCTION public.vita_reserve(p_user text, p_order text, p_points integer) SET search_path = public;
ALTER FUNCTION public.vita_reverse(p_order_id text, p_reason text) SET search_path = public;
ALTER FUNCTION public.vita_reverse_order(p_order text, p_returned_value numeric, p_reason text, p_type text, p_key text) SET search_path = public;
ALTER FUNCTION public.vita_summary(p_user text) SET search_path = public;
