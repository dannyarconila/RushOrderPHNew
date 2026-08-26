-- Pasugo is a rider-request service.
-- There is no customer-entered destination in the new flow.
--
-- Keep the legacy pickup/dropoff columns for compatibility, but make
-- pasugo_start() use the configured minimum dispatch fee instead of
-- calculating a fake pickup -> dropoff trip.
--
-- Rider-specific distance remains calculated by
-- pasugo_dispatch_broadcast() from rider -> customer pickup location.

CREATE OR REPLACE FUNCTION public.pasugo_start(_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  dist numeric := 0;
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

  -- Pasugo has no destination.
  -- The initial fare is therefore the configured minimum dispatch fee.
  fee := GREATEST(
    COALESCE((s->>'dispatch_min_fee')::numeric, 30),
    LEAST(
      COALESCE((s->>'dispatch_max_fee')::numeric, 300),
      0
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
  ON CONFLICT (booking_id) DO UPDATE
  SET status = CASE
                 WHEN public.pasugo_dispatch_jobs.status IN ('cancelled', 'failed')
                 THEN 'searching'
                 ELSE public.pasugo_dispatch_jobs.status
               END,
      updated_at = now()
  RETURNING id INTO job_id;

  UPDATE public.pasugo_bookings
  SET status = 'finding_rider',
      estimated_distance_km = dist,
      estimated_fare = fee,
      updated_at = now()
  WHERE id = b.id;

  PERFORM public.pasugo_dispatch_broadcast(job_id);

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    b.customer_id,
    'Finding a rider',
    'We are searching for nearby riders for your Pasugo booking.',
    'dispatch'
  );

  RETURN job_id;
END;
$function$;
