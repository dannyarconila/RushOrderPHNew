-- ============================================================
-- Marketplace Dispatch: Harden dispatch_accept()
--
-- Fixes:
-- 1. Rider must still be online + available at acceptance time.
-- 2. Rider status row is locked during acceptance.
-- 3. Specific rider offer is locked and validated.
-- 4. Expired pending offers are marked expired and rejected.
-- 5. Only the current valid pending offer is accepted.
--
-- Existing protections are preserved:
-- - rider role
-- - active account
-- - wallet minimum
-- - dispatch job FOR UPDATE
-- - order FOR UPDATE
-- - first-accept-wins
-- - cancellation of competing pending offers
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  o public.orders%ROWTYPE;
  offer public.dispatch_offers%ROWTYPE;
  rider public.rider_status%ROWTYPE;

  uid uuid := auth.uid();

  required_balance numeric;
  current_balance numeric;
  rider_account_status public.account_status;
BEGIN
  -- ----------------------------------------------------------
  -- Authentication
  -- ----------------------------------------------------------
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can accept deliveries.';
  END IF;

  -- ----------------------------------------------------------
  -- Account status
  -- ----------------------------------------------------------
  SELECT account_status
  INTO rider_account_status
  FROM public.profiles
  WHERE id = uid;

  IF rider_account_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason',
      CASE rider_account_status
        WHEN 'banned' THEN 'banned'
        WHEN 'suspended' THEN 'suspended'
        ELSE 'inactive'
      END
    );
  END IF;

  -- ----------------------------------------------------------
  -- Wallet guard
  -- ----------------------------------------------------------
  required_balance := public.minimum_wallet_balance_for_role('rider');

  SELECT balance
  INTO current_balance
  FROM public.wallets
  WHERE user_id = uid
    AND wallet_type = 'rider'
    AND deleted_at IS NULL
  LIMIT 1;

  IF current_balance IS NULL OR current_balance < required_balance THEN
    RAISE EXCEPTION
      'Your rider wallet balance must be at least ₱% to accept bookings.',
      required_balance;
  END IF;

  -- ----------------------------------------------------------
  -- Lock dispatch job first.
  -- This preserves first-accept-wins behavior.
  -- ----------------------------------------------------------
  SELECT *
  INTO j
  FROM public.dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  -- ----------------------------------------------------------
  -- Lock rider status.
  -- This prevents two concurrent acceptance attempts from
  -- using the same rider while changing availability.
  -- ----------------------------------------------------------
  SELECT *
  INTO rider
  FROM public.rider_status
  WHERE user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'rider_unavailable'
    );
  END IF;

  IF NOT rider.is_online OR NOT rider.is_available THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'rider_unavailable'
    );
  END IF;

  -- ----------------------------------------------------------
  -- Lock the exact offer belonging to this rider + job.
  -- ----------------------------------------------------------
  SELECT *
  INTO offer
  FROM public.dispatch_offers
  WHERE job_id = j.id
    AND rider_id = uid
    AND status = 'pending'
  ORDER BY attempt DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  -- ----------------------------------------------------------
  -- Enforce offer expiry at the database level.
  -- ----------------------------------------------------------
  IF offer.expires_at <= now() THEN

    UPDATE public.dispatch_offers
    SET
      status = 'expired',
      responded_at = now(),
      updated_at = now()
    WHERE id = offer.id;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'expired'
    );
  END IF;

  -- ----------------------------------------------------------
  -- Lock order.
  -- ----------------------------------------------------------
  SELECT *
  INTO o
  FROM public.orders
  WHERE id = j.order_id
  FOR UPDATE;

  IF NOT FOUND
     OR o.deleted_at IS NOT NULL
     OR o.status <> 'ready' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unavailable'
    );
  END IF;

  -- ----------------------------------------------------------
  -- Final job-state guard.
  -- Another rider may already have accepted.
  -- ----------------------------------------------------------
  IF j.status <> 'searching'
     OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'taken'
    );
  END IF;

  -- ----------------------------------------------------------
  -- Assign job.
  -- ----------------------------------------------------------
  UPDATE public.dispatch_jobs
  SET
    status = 'assigned',
    assigned_rider_id = uid,
    assigned_at = now(),
    expires_at = NULL,
    updated_at = now()
  WHERE id = j.id;

  -- Accept ONLY the exact offer that was validated above.
  UPDATE public.dispatch_offers
  SET
    status = 'accepted',
    responded_at = now(),
    updated_at = now()
  WHERE id = offer.id;

  -- ----------------------------------------------------------
  -- Cancel competing pending offers.
  -- ----------------------------------------------------------
  UPDATE public.dispatch_offers
  SET
    status = 'cancelled',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id <> uid
    AND status = 'pending';

  -- ----------------------------------------------------------
  -- Rider becomes unavailable.
  -- ----------------------------------------------------------
  UPDATE public.rider_status
  SET
    is_available = false,
    active_order_id = j.order_id,
    updated_at = now()
  WHERE user_id = uid;

  -- ----------------------------------------------------------
  -- Assign rider to order.
  -- ----------------------------------------------------------
  UPDATE public.orders
  SET
    rider_id = uid,
    updated_at = now()
  WHERE id = j.order_id;

  -- ----------------------------------------------------------
  -- Create/update delivery.
  -- ----------------------------------------------------------
  INSERT INTO public.deliveries (
    order_id,
    rider_id,
    status,
    pickup_address,
    dropoff_address,
    fee,
    distance_km,
    claim_number,
    accepted_at
  )
  VALUES (
    j.order_id,
    uid,
    'assigned',
    jsonb_build_object('text', j.pickup_address),
    jsonb_build_object('text', j.dropoff_address),
    j.delivery_fee,
    j.distance_km,
    o.claim_number,
    now()
  )
  ON CONFLICT (order_id)
  DO UPDATE SET
    rider_id = EXCLUDED.rider_id,
    status = 'assigned',
    accepted_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Customer notification.
  -- ----------------------------------------------------------
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    o.customer_id,
    'Rider assigned',
    'A rider is on the way to pick up your order.',
    'dispatch'
  );

  -- ----------------------------------------------------------
  -- Seller notification.
  -- ----------------------------------------------------------
  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  SELECT
    st.owner_id,
    'Rider assigned',
    'A rider accepted the delivery for order '
      || COALESCE(o.claim_number, left(o.id::text, 8))
      || '.',
    'dispatch'
  FROM public.stores st
  WHERE st.id = j.store_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', j.order_id
  );
END;
$function$;

REVOKE ALL
ON FUNCTION public.dispatch_accept(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.dispatch_accept(uuid)
TO authenticated, service_role;
