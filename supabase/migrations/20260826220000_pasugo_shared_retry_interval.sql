-- Make Pasugo retry timing follow the same shared Rider Dispatch
-- retry interval used by Marketplace dispatch.

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_retry(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  next_radius numeric;
  retry_interval_seconds integer;
BEGIN
  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND OR j.status <> 'searching' THEN
    RETURN false;
  END IF;

  -- The current rider-offer window must expire first.
  IF j.expires_at IS NOT NULL AND j.expires_at > now() THEN
    RETURN false;
  END IF;

  -- Use the same Admin-configured retry interval as Marketplace.
  retry_interval_seconds := GREATEST(
    COALESCE(
      (s->>'dispatch_retry_interval_seconds')::integer,
      15
    ),
    0
  );

  -- After the current offer window expires, wait the configured
  -- retry interval before creating the next dispatch wave.
  IF j.expires_at IS NOT NULL
     AND j.expires_at
       + make_interval(secs => retry_interval_seconds)
       > now() THEN
    RETURN false;
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR UPDATE;

  IF NOT FOUND OR b.status IN ('cancelled', 'completed') THEN
    RETURN false;
  END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.has_role(uid, 'admin')
    OR uid = b.customer_id
  ) THEN
    RAISE EXCEPTION 'You are not authorized to retry this booking.';
  END IF;

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'expired',
    updated_at = now()
  WHERE job_id = j.id
    AND status = 'pending'
    AND expires_at <= now();

  IF j.attempt >= COALESCE(j.max_attempts, 5) THEN
    UPDATE public.pasugo_dispatch_jobs
    SET
      status = 'failed',
      updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET
      status = 'failed',
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
      'No rider available',
      'No rider accepted your Pasugo booking.',
      'dispatch'
    );

    RETURN false;
  END IF;

  next_radius := j.radius_km;

  IF COALESCE(
    (s->>'dispatch_auto_expand')::boolean,
    true
  ) THEN
    next_radius := LEAST(
      COALESCE(
        (s->>'dispatch_max_radius_km')::numeric,
        10
      ),
      j.radius_km
        + COALESCE(
            (s->>'dispatch_radius_expansion_km')::numeric,
            2
          )
    );
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET
    attempt = j.attempt + 1,
    radius_km = next_radius,
    updated_at = now()
  WHERE id = j.id;

  -- Pasugo keeps its existing broadcast-all-online-riders behavior.
  PERFORM public.pasugo_dispatch_broadcast(j.id);

  RETURN true;
END;
$function$;

REVOKE ALL
ON FUNCTION public.pasugo_dispatch_retry(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_dispatch_retry(uuid)
TO authenticated, service_role;
