-- Restore Pasugo broadcast-all rider dispatch and location-based pricing.
-- Marketplace dispatch is intentionally untouched.

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_broadcast(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  s jsonb := public.dispatch_settings();
  timeout_s integer := COALESCE((s->>'dispatch_timeout_seconds')::int, 30);
  inserted_count integer := 0;
  r RECORD;
BEGIN
  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND OR j.status <> 'searching' THEN
    RETURN 0;
  END IF;

  -- Pasugo requires the customer's actual GPS position.
  IF j.pickup_lat IS NULL OR j.pickup_lng IS NULL THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT
      rs.user_id,
      public.haversine_km(
        rs.latitude,
        rs.longitude,
        j.pickup_lat,
        j.pickup_lng
      ) AS dist
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
    WHERE rs.is_online
      AND rs.is_available
      AND p.account_status = 'active'
      AND rs.latitude IS NOT NULL
      AND rs.longitude IS NOT NULL
      AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
      AND public.haversine_km(
        rs.latitude,
        rs.longitude,
        j.pickup_lat,
        j.pickup_lng
      ) <= j.radius_km
      AND NOT EXISTS (
        SELECT 1
        FROM public.pasugo_dispatch_offers o
        WHERE o.job_id = j.id
          AND o.rider_id = rs.user_id
          AND o.status = 'declined'
      )
    ORDER BY dist ASC, rs.last_seen_at DESC
  LOOP
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
      r.user_id,
      j.attempt,
      r.dist,
      now() + make_interval(secs => timeout_s)
    )
    ON CONFLICT (job_id, rider_id, attempt) DO NOTHING;

    IF FOUND THEN
      inserted_count := inserted_count + 1;

      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        kind
      )
      VALUES (
        r.user_id,
        'New Pasugo booking',
        'A nearby customer needs errand help — PHP '
          || to_char(j.delivery_fee, 'FM999999990.00'),
        'dispatch'
      );
    END IF;
  END LOOP;

  UPDATE public.pasugo_dispatch_jobs
  SET
    expires_at = now() + make_interval(secs => timeout_s),
    last_attempt_at = now(),
    updated_at = now()
  WHERE id = j.id;

  RETURN inserted_count;
END;
$function$;


CREATE OR REPLACE FUNCTION public.pasugo_start(_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  dist numeric;
  fee numeric;
  job_id uuid;
BEGIN
  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.has_role(uid, 'admin')
    OR uid = b.customer_id
  ) THEN
    RAISE EXCEPTION 'You are not allowed to start this booking.';
  END IF;

  IF b.status IN ('cancelled', 'completed') THEN
    RETURN NULL;
  END IF;

  -- Pasugo price is based on customer pickup GPS to requested destination GPS.
  IF b.pickup_lat IS NULL
     OR b.pickup_lng IS NULL
     OR b.dropoff_lat IS NULL
     OR b.dropoff_lng IS NULL THEN
    RAISE EXCEPTION 'Valid pickup and destination locations are required.';
  END IF;

  dist := public.haversine_km(
    b.pickup_lat,
    b.pickup_lng,
    b.dropoff_lat,
    b.dropoff_lng
  );

  IF dist IS NULL THEN
    RAISE EXCEPTION 'Unable to calculate Pasugo distance.';
  END IF;

  fee := GREATEST(
    COALESCE((s->>'dispatch_min_fee')::numeric, 49),
    LEAST(
      COALESCE((s->>'dispatch_max_fee')::numeric, 300),
      round(
        dist * COALESCE((s->>'dispatch_fee_per_km')::numeric, 15),
        2
      )
    )
  );

  INSERT INTO public.pasugo_dispatch_jobs (
    booking_id,
    status,
    radius_km,
    attempt,
    max_attempts,
    distance_km,
    delivery_fee,
    pickup_address,
    dropoff_address,
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng
  )
  VALUES (
    b.id,
    'searching',
    COALESCE((s->>'dispatch_radius_km')::numeric, 5),
    1,
    COALESCE((s->>'dispatch_max_retries')::int, 5),
    dist,
    fee,
    b.pickup_address,
    b.dropoff_address,
    b.pickup_lat,
    b.pickup_lng,
    b.dropoff_lat,
    b.dropoff_lng
  )
  ON CONFLICT (booking_id)
  DO UPDATE SET
    status = CASE
      WHEN public.pasugo_dispatch_jobs.status IN ('cancelled', 'failed')
        THEN 'searching'
      ELSE public.pasugo_dispatch_jobs.status
    END,
    distance_km = EXCLUDED.distance_km,
    delivery_fee = EXCLUDED.delivery_fee,
    pickup_address = EXCLUDED.pickup_address,
    dropoff_address = EXCLUDED.dropoff_address,
    pickup_lat = EXCLUDED.pickup_lat,
    pickup_lng = EXCLUDED.pickup_lng,
    dropoff_lat = EXCLUDED.dropoff_lat,
    dropoff_lng = EXCLUDED.dropoff_lng,
    updated_at = now()
  RETURNING id INTO job_id;

  UPDATE public.pasugo_bookings
  SET
    status = 'finding_rider',
    estimated_distance_km = dist,
    estimated_fare = fee,
    updated_at = now()
  WHERE id = b.id;

  -- Broadcast simultaneously to ALL eligible riders.
  PERFORM public.pasugo_dispatch_broadcast(job_id);

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind,
    pasugo_booking_id
  )
  VALUES (
    b.customer_id,
    'Finding a rider',
    'We are searching for nearby riders for your Pasugo booking.',
    'dispatch',
    b.id
  );

  RETURN job_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.pasugo_start(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_start(uuid) TO authenticated, service_role;
