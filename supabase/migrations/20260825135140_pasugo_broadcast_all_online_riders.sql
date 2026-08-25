-- Pasugo dispatch: broadcast simultaneously to all eligible online riders.
-- The first rider to successfully accept still wins the booking.
-- Explicitly declined riders remain excluded; expired offers may be retried.

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
  sent integer := 0;
  r record;
BEGIN
  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND OR j.status <> 'searching' THEN
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
      AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
      AND (
        public.haversine_km(
          rs.latitude,
          rs.longitude,
          j.pickup_lat,
          j.pickup_lng
        ) IS NULL
        OR public.haversine_km(
          rs.latitude,
          rs.longitude,
          j.pickup_lat,
          j.pickup_lng
        ) <= j.radius_km
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.pasugo_dispatch_offers o
        WHERE o.job_id = j.id
          AND o.rider_id = rs.user_id
          AND o.status = 'declined'
      )
    ORDER BY dist NULLS LAST, rs.last_seen_at DESC
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
      sent := sent + 1;

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

  RETURN sent;
END;
$function$;

REVOKE ALL
ON FUNCTION public.pasugo_dispatch_broadcast(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_dispatch_broadcast(uuid)
TO authenticated, service_role;
