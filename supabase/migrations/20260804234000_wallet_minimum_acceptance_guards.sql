-- Enforce minimum wallet balance at acceptance time for sellers and riders.
-- This guarantees blocking even if UI state/cache is stale after setting changes.

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
  required_balance numeric;
  current_balance numeric;
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

    -- Enforce minimum seller wallet at order acceptance/progression time.
    IF NEW.status IN ('confirmed', 'preparing', 'ready') THEN
      required_balance := public.minimum_wallet_balance_for_role('seller');
      SELECT balance INTO current_balance
      FROM public.wallets
      WHERE user_id = uid
        AND wallet_type = 'seller'
        AND deleted_at IS NULL
      LIMIT 1;

      IF current_balance IS NULL OR current_balance < required_balance THEN
        RAISE EXCEPTION 'Your seller wallet balance must be at least ₱% to accept or process orders.', required_balance;
      END IF;
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

CREATE OR REPLACE FUNCTION public.dispatch_accept(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  required_balance numeric;
  current_balance numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF NOT public.has_role(uid, 'rider') THEN RAISE EXCEPTION 'Only approved riders can accept deliveries.'; END IF;

  -- Enforce minimum rider wallet at booking acceptance time.
  required_balance := public.minimum_wallet_balance_for_role('rider');
  SELECT balance INTO current_balance
  FROM public.wallets
  WHERE user_id = uid
    AND wallet_type = 'rider'
    AND deleted_at IS NULL
  LIMIT 1;

  IF current_balance IS NULL OR current_balance < required_balance THEN
    RAISE EXCEPTION 'Your rider wallet balance must be at least ₱% to accept bookings.', required_balance;
  END IF;

  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dispatch_offers WHERE job_id = j.id AND rider_id = uid) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching' OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  UPDATE public.dispatch_jobs
     SET status = 'assigned', assigned_rider_id = uid, assigned_at = now(), expires_at = NULL, updated_at = now()
   WHERE id = j.id;

  UPDATE public.dispatch_offers SET status = 'accepted', responded_at = now()
   WHERE job_id = j.id AND rider_id = uid;
  UPDATE public.dispatch_offers SET status = 'cancelled', responded_at = now()
   WHERE job_id = j.id AND rider_id <> uid AND status = 'pending';

  UPDATE public.rider_status
     SET is_available = false, active_order_id = j.order_id, updated_at = now()
   WHERE user_id = uid;

  UPDATE public.orders SET rider_id = uid, updated_at = now() WHERE id = j.order_id;
  SELECT * INTO o FROM public.orders WHERE id = j.order_id;

  INSERT INTO public.deliveries (order_id, rider_id, status, pickup_address, dropoff_address, fee, distance_km, claim_number, accepted_at)
  VALUES (j.order_id, uid, 'assigned',
          jsonb_build_object('text', j.pickup_address), jsonb_build_object('text', j.dropoff_address),
          j.delivery_fee, j.distance_km, o.claim_number, now())
  ON CONFLICT (order_id) DO UPDATE
     SET rider_id = EXCLUDED.rider_id, status = 'assigned', accepted_at = now(), updated_at = now();

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (o.customer_id, 'Rider assigned', 'A rider is on the way to pick up your order.', 'dispatch');
  INSERT INTO public.notifications (user_id, title, body, kind)
  SELECT st.owner_id, 'Rider assigned', 'A rider accepted the delivery for order ' || COALESCE(o.claim_number, left(o.id::text, 8)) || '.', 'dispatch'
    FROM public.stores st WHERE st.id = j.store_id;

  RETURN jsonb_build_object('ok', true, 'order_id', j.order_id);
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_accept(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_accept(uuid) TO authenticated, service_role;
