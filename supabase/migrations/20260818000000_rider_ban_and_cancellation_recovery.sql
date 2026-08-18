-- ============================================================
-- RushOrder PH
-- Rider account restriction + cancellation recovery
--
-- Goals:
-- 1. Ban/suspend rider immediately takes rider offline.
-- 2. Ban/suspend reason is stored in profiles.status_note.
-- 3. Rider receives an account-status notification.
-- 4. Restricted riders cannot accept new marketplace/Pasugo jobs.
-- 5. Pending offers are cancelled when rider is restricted.
-- 6. Marketplace cancellation releases the affected rider.
-- 7. Pasugo cancellation releases the affected rider.
-- 8. A rider is only made available when they have no other
--    active marketplace/Pasugo assignment.
-- ============================================================


-- ============================================================
-- Helper: safely restore rider availability
-- ============================================================

CREATE OR REPLACE FUNCTION public.refresh_rider_availability(_rider_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_state public.account_status;
  has_marketplace_job boolean;
  has_pasugo_job boolean;
BEGIN
  SELECT account_status
  INTO account_state
  FROM public.profiles
  WHERE id = _rider_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Restricted accounts can never become available.
  IF account_state IN ('banned', 'suspended') THEN
    UPDATE public.rider_status
    SET
      is_online = false,
      is_available = false,
      updated_at = now()
    WHERE user_id = _rider_id;

    RETURN;
  END IF;

  -- Check active marketplace dispatch assignments.
  SELECT EXISTS (
    SELECT 1
    FROM public.dispatch_jobs dj
    WHERE dj.assigned_rider_id = _rider_id
      AND dj.status IN ('assigned', 'picked_up')
  )
  INTO has_marketplace_job;

  -- Check active Pasugo assignments.
  SELECT EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_jobs pj
    WHERE pj.assigned_rider_id = _rider_id
      AND pj.status IN ('assigned', 'picked_up')
  )
  INTO has_pasugo_job;

  IF has_marketplace_job OR has_pasugo_job THEN
    UPDATE public.rider_status
    SET
      is_available = false,
      updated_at = now()
    WHERE user_id = _rider_id;
  ELSE
    UPDATE public.rider_status
    SET
      is_available = true,
      updated_at = now()
    WHERE user_id = _rider_id;
  END IF;
END;
$$;

REVOKE ALL
ON FUNCTION public.refresh_rider_availability(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.refresh_rider_availability(uuid)
TO authenticated, service_role;


-- ============================================================
-- 1. Admin account status
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_portal_set_account_status(
  _user_id uuid,
  _status public.account_status,
  _note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status public.account_status;
  rider_exists boolean;
  clean_note text;
BEGIN
  IF NOT public.is_portal_admin()
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Only administrators can change account status.';
  END IF;

  clean_note := NULLIF(btrim(_note), '');

  SELECT account_status
  INTO old_status
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User account not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'rider'
  )
  INTO rider_exists;

  UPDATE public.profiles
  SET
    account_status = _status,
    status_note = clean_note
  WHERE id = _user_id;

  IF rider_exists AND _status IN ('banned', 'suspended') THEN

    -- Immediately remove rider from the availability pool.
    UPDATE public.rider_status
    SET
      is_online = false,
      is_available = false,
      updated_at = now()
    WHERE user_id = _user_id;

    -- Cancel marketplace offers that have not been accepted.
    UPDATE public.dispatch_offers
    SET
      status = 'cancelled',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE rider_id = _user_id
      AND status = 'pending';

    -- Cancel Pasugo offers that have not been accepted.
    UPDATE public.pasugo_dispatch_offers
    SET
      status = 'cancelled',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE rider_id = _user_id
      AND status = 'pending';

  ELSIF rider_exists
        AND _status = 'active'
        AND old_status IS DISTINCT FROM 'active' THEN

    -- Reactivation never automatically puts the rider online.
    PERFORM public.refresh_rider_availability(_user_id);
  END IF;

  IF old_status IS DISTINCT FROM _status THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      kind
    )
    VALUES (
      _user_id,
      CASE
        WHEN _status = 'banned' THEN 'Rider account banned'
        WHEN _status = 'suspended' THEN 'Rider account suspended'
        WHEN _status = 'active' THEN 'Rider account reactivated'
        ELSE 'Account status updated'
      END,
      CASE
        WHEN _status = 'banned'
          THEN 'Your rider account has been banned.'
            || COALESCE(' Reason: ' || clean_note, '')
        WHEN _status = 'suspended'
          THEN 'Your rider account has been suspended.'
            || COALESCE(' Reason: ' || clean_note, '')
        WHEN _status = 'active'
          THEN 'Your rider account has been reactivated. You may go online again when ready.'
        ELSE
          'Your account status has been changed to '
          || _status::text
          || COALESCE('. Note: ' || clean_note, '.')
      END,
      'account'
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_portal_set_account_status(
  uuid,
  public.account_status,
  text
)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_portal_set_account_status(
  uuid,
  public.account_status,
  text
)
TO service_role;


-- ============================================================
-- 2. Marketplace dispatch acceptance
--    Add authoritative account-status protection.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  required_balance numeric;
  current_balance numeric;
  rider_account_status public.account_status;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can accept deliveries.';
  END IF;

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

  SELECT *
  INTO j
  FROM public.dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

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

  IF NOT EXISTS (
    SELECT 1
    FROM public.dispatch_offers
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching'
     OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'taken'
    );
  END IF;

  UPDATE public.dispatch_jobs
  SET
    status = 'assigned',
    assigned_rider_id = uid,
    assigned_at = now(),
    expires_at = NULL,
    updated_at = now()
  WHERE id = j.id;

  UPDATE public.dispatch_offers
  SET
    status = 'accepted',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id = uid;

  UPDATE public.dispatch_offers
  SET
    status = 'cancelled',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id <> uid
    AND status = 'pending';

  UPDATE public.rider_status
  SET
    is_available = false,
    active_order_id = j.order_id,
    updated_at = now()
  WHERE user_id = uid;

  UPDATE public.orders
  SET
    rider_id = uid,
    updated_at = now()
  WHERE id = j.order_id;

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
$$;

REVOKE ALL
ON FUNCTION public.dispatch_accept(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.dispatch_accept(uuid)
TO authenticated, service_role;


-- ============================================================
-- 3. Pasugo dispatch acceptance
--    Add authoritative account-status protection.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
  rider_account_status public.account_status;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can accept bookings.';
  END IF;

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

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR b.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unavailable'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching'
     OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'taken'
    );
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET
    status = 'assigned',
    assigned_rider_id = uid,
    assigned_at = now(),
    expires_at = NULL,
    updated_at = now()
  WHERE id = j.id;

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'accepted',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id = uid;

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'cancelled',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id <> uid
    AND status = 'pending';

  UPDATE public.rider_status
  SET
    is_available = false,
    updated_at = now()
  WHERE user_id = uid;

  UPDATE public.pasugo_bookings
  SET
    assigned_rider_id = uid,
    status = 'accepted',
    updated_at = now()
  WHERE id = j.booking_id;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    b.customer_id,
    'Rider assigned',
    'A rider accepted your Pasugo booking.',
    'dispatch'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', j.booking_id
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.pasugo_dispatch_accept(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_dispatch_accept(uuid)
TO authenticated, service_role;


-- ============================================================
-- 4. Marketplace cancellation recovery
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_rider_after_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rider_id uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  rider_id := NEW.rider_id;

  IF rider_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.dispatch_jobs
  SET
    status = 'cancelled',
    updated_at = now()
  WHERE order_id = NEW.id
    AND status NOT IN ('delivered', 'cancelled');

  UPDATE public.dispatch_offers
  SET
    status = 'cancelled',
    responded_at = COALESCE(responded_at, now()),
    updated_at = now()
  WHERE order_id = NEW.id
    AND status = 'pending';

  -- Recalculate from all remaining active assignments.
  PERFORM public.refresh_rider_availability(rider_id);

  -- If this order was the rider's active marketplace order,
  -- clear it after the cancellation.
  UPDATE public.rider_status
  SET
    active_order_id = NULL,
    updated_at = now()
  WHERE user_id = rider_id
    AND active_order_id = NEW.id;

  PERFORM public.refresh_rider_availability(rider_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_rider_after_order_cancel
ON public.orders;

CREATE TRIGGER trg_release_rider_after_order_cancel
AFTER UPDATE OF status
ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.release_rider_after_order_cancel();


-- ============================================================
-- 5. Pasugo cancellation recovery
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_rider_after_pasugo_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rider_id uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  rider_id := NEW.assigned_rider_id;

  UPDATE public.pasugo_dispatch_jobs
  SET
    status = 'cancelled',
    updated_at = now()
  WHERE booking_id = NEW.id
    AND status NOT IN ('delivered', 'cancelled');

  UPDATE public.pasugo_dispatch_offers
  SET
    status = CASE
      WHEN status = 'accepted' THEN 'cancelled'
      ELSE 'cancelled'
    END,
    responded_at = COALESCE(responded_at, now()),
    updated_at = now()
  WHERE booking_id = NEW.id
    AND status IN ('pending', 'accepted');

  IF rider_id IS NOT NULL THEN
    PERFORM public.refresh_rider_availability(rider_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_rider_after_pasugo_cancel
ON public.pasugo_bookings;

CREATE TRIGGER trg_release_rider_after_pasugo_cancel
AFTER UPDATE OF status
ON public.pasugo_bookings
FOR EACH ROW
EXECUTE FUNCTION public.release_rider_after_pasugo_cancel();


-- ============================================================
-- 6. Repair riders already stuck on cancelled marketplace jobs
-- ============================================================

UPDATE public.rider_status rs
SET
  active_order_id = NULL,
  updated_at = now()
FROM public.profiles p
WHERE p.id = rs.user_id
  AND rs.active_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = rs.active_order_id
      AND o.status = 'cancelled'
  );

-- Recalculate availability after clearing stale orders.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT rs.user_id
    FROM public.rider_status rs
    JOIN public.profiles p ON p.id = rs.user_id
    WHERE p.account_status = 'active'
  LOOP
    PERFORM public.refresh_rider_availability(r.user_id);
  END LOOP;
END;
$$;


-- ============================================================
-- 7. Force all currently restricted riders offline
-- ============================================================

UPDATE public.rider_status rs
SET
  is_online = false,
  is_available = false,
  updated_at = now()
FROM public.profiles p
WHERE p.id = rs.user_id
  AND p.account_status IN ('banned', 'suspended');
