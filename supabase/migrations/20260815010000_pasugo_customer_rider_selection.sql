-- ============================================================
-- Pasugo customer-selected rider dispatch
--
-- Customer sees eligible online riders sorted nearest first,
-- chooses exactly one rider, and only that rider receives
-- the Pasugo request.
--
-- Rider rejection is scoped to the current Pasugo job only.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Return eligible online riders sorted by pickup distance
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pasugo_available_riders(
  _job_id uuid
)
RETURNS TABLE (
  rider_id uuid,
  rider_name text,
  distance_km numeric,
  latitude numeric,
  longitude numeric,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  required_balance numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pasugo dispatch job not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR SHARE;

  IF NOT FOUND OR b.customer_id <> uid THEN
    RAISE EXCEPTION 'You are not authorized to view riders for this booking.';
  END IF;

  IF j.status <> 'searching'
     OR b.status NOT IN ('requested', 'finding_rider')
  THEN
    RETURN;
  END IF;

  -- A rider who is already handling another job is not eligible.
  required_balance := public.minimum_wallet_balance_for_role('rider');

  RETURN QUERY
  SELECT
    rs.user_id AS rider_id,

    COALESCE(
      NULLIF(to_jsonb(p)->>'full_name', ''),
      NULLIF(to_jsonb(p)->>'display_name', ''),
      NULLIF(
        concat_ws(
          ' ',
          NULLIF(to_jsonb(p)->>'first_name', ''),
          NULLIF(to_jsonb(p)->>'last_name', '')
        ),
        ''
      ),
      'RushOrder Rider'
    ) AS rider_name,

    ROUND(
      public.haversine_km(
        rs.latitude,
        rs.longitude,
        j.pickup_lat,
        j.pickup_lng
      ),
      2
    ) AS distance_km,

    rs.latitude,
    rs.longitude,
    rs.last_seen_at

  FROM public.rider_status rs

  JOIN public.user_roles ur
    ON ur.user_id = rs.user_id
   AND ur.role = 'rider'

  JOIN public.profiles p
    ON p.id = rs.user_id

  LEFT JOIN public.wallets w
    ON w.user_id = rs.user_id
   AND w.wallet_type = 'rider'
   AND w.deleted_at IS NULL

  WHERE rs.is_online = true
    AND rs.is_available = true
    AND rs.latitude IS NOT NULL
    AND rs.longitude IS NOT NULL
    AND p.account_status = 'active'
    AND COALESCE(w.balance, 0) >= required_balance

    -- This rider must not have rejected this Pasugo job.
    AND NOT EXISTS (
      SELECT 1
      FROM public.pasugo_dispatch_offers o
      WHERE o.job_id = j.id
        AND o.rider_id = rs.user_id
        AND o.status = 'declined'
    )

    -- Don't show the currently selected rider again while
    -- their request is still pending.
    AND NOT EXISTS (
      SELECT 1
      FROM public.pasugo_dispatch_offers o
      WHERE o.job_id = j.id
        AND o.rider_id = rs.user_id
        AND o.status = 'pending'
        AND o.expires_at > now()
    )

  ORDER BY
    public.haversine_km(
      rs.latitude,
      rs.longitude,
      j.pickup_lat,
      j.pickup_lng
    ) ASC,
    rs.last_seen_at DESC;

END;
$$;


REVOKE ALL
ON FUNCTION public.pasugo_available_riders(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_available_riders(uuid)
TO authenticated, service_role;


-- ------------------------------------------------------------
-- 2. Customer selects exactly ONE rider
-- ------------------------------------------------------------

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
  -- select different riders for the same Pasugo.
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
      AND COALESCE(
        w.balance,
        0
      ) >= public.minimum_wallet_balance_for_role('rider')
  ) THEN
    RAISE EXCEPTION 'That rider is not currently eligible.';
  END IF;

  -- A rider who rejected this booking cannot be selected again.
  IF EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers o
    WHERE o.job_id = j.id
      AND o.rider_id = _rider_id
      AND o.status = 'declined'
  ) THEN
    RAISE EXCEPTION 'That rider has already declined this booking. Please choose another rider.';
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
    'New Pasugo request',
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


-- ------------------------------------------------------------
-- 3. Rejection remains booking-scoped
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_decline(
  _job_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  changed boolean := false;
  booking_customer uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT b.customer_id
  INTO booking_customer
  FROM public.pasugo_dispatch_jobs j
  JOIN public.pasugo_bookings b
    ON b.id = j.booking_id
  WHERE j.id = _job_id;

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'declined',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = _job_id
    AND rider_id = uid
    AND status = 'pending';

  changed := FOUND;

  IF changed THEN
    -- Keep the booking available for the customer to select
    -- another rider. Do NOT change rider_status.
    UPDATE public.pasugo_dispatch_jobs
    SET
      expires_at = NULL,
      updated_at = now()
    WHERE id = _job_id
      AND status = 'searching';

    UPDATE public.pasugo_bookings
    SET
      status = 'finding_rider',
      updated_at = now()
    WHERE id = (
      SELECT booking_id
      FROM public.pasugo_dispatch_jobs
      WHERE id = _job_id
    )
    AND status NOT IN ('cancelled', 'completed');

    IF booking_customer IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        kind
      )
      VALUES (
        booking_customer,
        'Rider declined',
        'The selected rider declined your Pasugo request. Please choose another rider.',
        'dispatch'
      );
    END IF;
  END IF;

  RETURN changed;
END;
$$;


REVOKE ALL
ON FUNCTION public.pasugo_dispatch_decline(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_dispatch_decline(uuid)
TO authenticated, service_role;
