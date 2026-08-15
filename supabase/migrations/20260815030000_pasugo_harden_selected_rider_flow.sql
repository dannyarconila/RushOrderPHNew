-- ============================================================
-- Harden Pasugo customer-selected rider flow.
--
-- A rider who already declined OR timed out on this Pasugo
-- booking cannot be selected again for the same booking.
-- This is enforced server-side, not only by the UI.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pasugo_select_rider(
  _job_id uuid,
  _rider_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  rs public.rider_status%ROWTYPE;
  required_balance numeric;
  rider_distance numeric;
  timeout_s integer;
  offer_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  -- Lock the job so two simultaneous customer actions cannot
  -- select different riders for the same Pasugo booking.
  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pasugo dispatch job not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR UPDATE;

  IF NOT FOUND OR b.customer_id <> uid THEN
    RAISE EXCEPTION 'You are not authorized to select a rider for this booking.';
  END IF;

  IF j.status <> 'searching'
     OR b.status NOT IN ('requested', 'finding_rider')
  THEN
    RAISE EXCEPTION 'This Pasugo booking is no longer selecting a rider.';
  END IF;

  -- Only one rider request may be active at a time.
  IF EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers
    WHERE job_id = j.id
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RAISE EXCEPTION 'A rider request is already waiting for a response.';
  END IF;

  -- The selected rider must still be online and available.
  SELECT *
  INTO rs
  FROM public.rider_status
  WHERE user_id = _rider_id
  FOR UPDATE;

  IF NOT FOUND
     OR rs.is_online IS DISTINCT FROM true
     OR rs.is_available IS DISTINCT FROM true
     OR rs.latitude IS NULL
     OR rs.longitude IS NULL
  THEN
    RAISE EXCEPTION 'That rider is no longer available. Please choose another rider.';
  END IF;

  -- Re-check rider eligibility server-side.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p
      ON p.id = ur.user_id
    LEFT JOIN public.wallets w
      ON w.user_id = ur.user_id
     AND w.wallet_type = 'rider'
     AND w.deleted_at IS NULL
    WHERE ur.user_id = _rider_id
      AND ur.role = 'rider'
      AND p.account_status = 'active'
      AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
  ) THEN
    RAISE EXCEPTION 'That rider is not currently eligible.';
  END IF;

  -- A rider who already rejected OR timed out on this booking
  -- cannot be selected again for this same booking.
  IF EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers o
    WHERE o.job_id = j.id
      AND o.rider_id = _rider_id
      AND o.status IN ('declined', 'expired')
  ) THEN
    RAISE EXCEPTION 'That rider has already declined or timed out on this booking. Please choose another rider.';
  END IF;

  rider_distance := ROUND(
    public.haversine_km(
      rs.latitude,
      rs.longitude,
      j.pickup_lat,
      j.pickup_lng
    ),
    2
  );

  timeout_s := COALESCE(
    (public.dispatch_settings()->>'dispatch_timeout_seconds')::int,
    30
  );

  INSERT INTO public.pasugo_dispatch_offers (
    job_id,
    booking_id,
    rider_id,
    attempt,
    distance_km,
    expires_at
  )
  VALUES (
    j.id,
    j.booking_id,
    _rider_id,
    j.attempt,
    rider_distance,
    now() + make_interval(secs => timeout_s)
  )
  RETURNING id INTO offer_id;

  UPDATE public.pasugo_dispatch_jobs
  SET
    expires_at = now() + make_interval(secs => timeout_s),
    last_attempt_at = now(),
    updated_at = now()
  WHERE id = j.id;

  UPDATE public.pasugo_bookings
  SET
    status = 'finding_rider',
    updated_at = now()
  WHERE id = b.id;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    _rider_id,
    'Pasugo rider request',
    'A customer selected you for a Pasugo booking. Please accept or reject the request.',
    'dispatch'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'offer_id', offer_id,
    'rider_id', _rider_id,
    'distance_km', rider_distance,
    'expires_at', now() + make_interval(secs => timeout_s)
  );
END;
$$;

REVOKE ALL
ON FUNCTION public.pasugo_select_rider(uuid, uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_select_rider(uuid, uuid)
TO authenticated, service_role;
