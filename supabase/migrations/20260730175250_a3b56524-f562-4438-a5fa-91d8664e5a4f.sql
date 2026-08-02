
-- 1) Orders: block non-admin edits of financial fields
CREATE OR REPLACE FUNCTION public.guard_order_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.subtotal := OLD.subtotal;
  NEW.delivery_fee := OLD.delivery_fee;
  NEW.surge_fee := OLD.surge_fee;
  NEW.tax := OLD.tax;
  NEW.total := OLD.total;
  NEW.seller_commission := OLD.seller_commission;
  NEW.rider_commission := OLD.rider_commission;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.customer_id := OLD.customer_id;
  NEW.store_id := OLD.store_id;
  NEW.distance_km := OLD.distance_km;
  NEW.claim_number := OLD.claim_number;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_guard_financials ON public.orders;
CREATE TRIGGER trg_orders_guard_financials
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_financial_fields();

-- 2) Wallet top-ups: owners may only cancel a pending request
DROP TRIGGER IF EXISTS trg_wallet_topups_guard ON public.wallet_topups;
CREATE TRIGGER trg_wallet_topups_guard
BEFORE INSERT OR UPDATE ON public.wallet_topups
FOR EACH ROW EXECUTE FUNCTION public.guard_wallet_topup();

DROP POLICY IF EXISTS wallet_topups_update_own_pending ON public.wallet_topups;
CREATE POLICY wallet_topups_update_own_pending
ON public.wallet_topups
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status IN ('pending', 'cancelled'));

-- 3) SECURITY DEFINER functions must not be callable by signed-out visitors
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.claim_first_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.admin_bootstrap_available() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_bootstrap_available() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.approve_wallet_topup(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.approve_wallet_topup(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.reject_wallet_topup(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.reject_wallet_topup(uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.guard_order_financial_fields() FROM anon, public, authenticated;
