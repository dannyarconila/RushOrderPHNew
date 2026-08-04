-- Targeted production fixes: inventory consistency, seller cancellation flow,
-- wallet threshold auto-enforcement, and owner-hidden wallet transactions.

-- Allow seller decline/cancel transitions before pickup while keeping strict
-- customer and rider guards.
CREATE OR REPLACE FUNCTION public.guard_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_store_owner boolean := EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id AND s.owner_id = uid
  );
  is_assigned_rider boolean := OLD.rider_id = uid AND EXISTS (
    SELECT 1 FROM public.dispatch_jobs j WHERE j.order_id = OLD.id AND j.assigned_rider_id = uid
  );
BEGIN
  IF public.is_portal_admin() OR public.has_role(uid, 'admin')
     OR current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF uid = OLD.customer_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Customers may only cancel pending orders.';
    END IF;
    NEW.rider_id := OLD.rider_id;
    RETURN NEW;
  END IF;

  IF is_store_owner THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (
         (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'cancelled'))
         OR (OLD.status = 'confirmed' AND NEW.status IN ('preparing', 'cancelled'))
         OR (OLD.status = 'preparing' AND NEW.status IN ('ready', 'cancelled'))
         OR (OLD.status = 'ready' AND NEW.status = 'cancelled')
       ) THEN
      RAISE EXCEPTION 'Invalid seller order transition.';
    END IF;
    NEW.rider_id := OLD.rider_id;
    RETURN NEW;
  END IF;

  -- dispatch_accept sets rider_id while the order remains ready.
  IF OLD.rider_id IS NULL AND NEW.rider_id = uid
     AND NEW.status = OLD.status
     AND EXISTS (
       SELECT 1 FROM public.dispatch_jobs j
       WHERE j.order_id = OLD.id AND j.assigned_rider_id = uid AND j.status = 'assigned'
     ) THEN
    RETURN NEW;
  END IF;

  IF is_assigned_rider
     AND ((OLD.status = 'ready' AND NEW.status = 'picked_up')
       OR (OLD.status = 'picked_up' AND NEW.status = 'delivered')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not authorized to change this order.';
END;
$$;

-- Deduct stock exactly once on seller acceptance and restore exactly once when
-- a seller cancels before pickup.
CREATE OR REPLACE FUNCTION public.sync_order_inventory_on_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_shortage boolean;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Seller accepts: reserve inventory atomically.
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
        AND COALESCE(p.stock, 0) < oi.quantity
      FOR UPDATE OF p
    )
    INTO has_shortage;

    IF has_shortage THEN
      RAISE EXCEPTION 'Insufficient stock to accept this order.';
    END IF;

    UPDATE public.products p
    SET stock = p.stock - oi.quantity,
        is_available = CASE WHEN p.stock - oi.quantity > 0 THEN p.is_available ELSE false END,
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;

  -- Seller cancels before pickup: restore previously reserved stock.
  IF OLD.status IN ('confirmed', 'preparing', 'ready') AND NEW.status = 'cancelled' THEN
    UPDATE public.products p
    SET stock = p.stock + oi.quantity,
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_inventory_sync ON public.orders;
CREATE TRIGGER trg_orders_inventory_sync
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_order_inventory_on_transition();

-- Keep wallet minimum enforcement automatic whenever balances change.
CREATE OR REPLACE FUNCTION public.enforce_wallet_threshold_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_balance numeric;
  should_be_online boolean;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  required_balance := public.minimum_wallet_balance_for_role(NEW.wallet_type::text);
  should_be_online := COALESCE(NEW.balance, 0) >= required_balance;

  IF NEW.wallet_type = 'seller' THEN
    UPDATE public.stores
       SET wallet_hold = NOT should_be_online,
           is_online = CASE WHEN should_be_online THEN true ELSE false END,
           updated_at = now()
     WHERE owner_id = NEW.user_id
       AND deleted_at IS NULL;
  ELSIF NEW.wallet_type = 'rider' THEN
    INSERT INTO public.rider_status (user_id, is_online, last_seen_at)
    VALUES (NEW.user_id, should_be_online, now())
    ON CONFLICT (user_id) DO UPDATE
      SET is_online = EXCLUDED.is_online,
          last_seen_at = now(),
          updated_at = now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_enforce_threshold ON public.wallets;
CREATE TRIGGER trg_wallet_enforce_threshold
AFTER INSERT OR UPDATE OF balance, wallet_type, deleted_at ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.enforce_wallet_threshold_on_change();

-- Owner-only hide markers for transaction history. Financial records are never
-- deleted or mutated.
CREATE TABLE IF NOT EXISTS public.wallet_transaction_hides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_transaction_id uuid NOT NULL REFERENCES public.wallet_transactions(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, wallet_transaction_id)
);

GRANT SELECT, INSERT ON public.wallet_transaction_hides TO authenticated;
GRANT ALL ON public.wallet_transaction_hides TO service_role;
ALTER TABLE public.wallet_transaction_hides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_tx_hides_own_read ON public.wallet_transaction_hides;
CREATE POLICY wallet_tx_hides_own_read ON public.wallet_transaction_hides
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS wallet_tx_hides_own_insert ON public.wallet_transaction_hides;
CREATE POLICY wallet_tx_hides_own_insert ON public.wallet_transaction_hides
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.wallet_transactions tx
    JOIN public.wallets w ON w.id = tx.wallet_id
    WHERE tx.id = wallet_transaction_id
      AND w.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_hides_user ON public.wallet_transaction_hides (user_id, hidden_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_hides_tx ON public.wallet_transaction_hides (wallet_transaction_id);
