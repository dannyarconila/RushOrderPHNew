-- Pasugo dispatch must use real GPS coordinates for both the request
-- and the rider. A missing coordinate must never make a rider eligible.

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_broadcast(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  r RECORD;
  inserted_count integer := 0;
  offer_seconds integer;
BEGIN
  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND OR j.status <> 'searching' THEN
    RETURN 0;
  END IF;

  -- Pasugo dispatch requires a valid customer/request GPS position.
  IF j.pickup_lat IS NULL OR j.pickup_lng IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(
    (
      SELECT value::integer
      FROM public.system_settings
      WHERE key = 'dispatch_timeout_seconds'
      LIMIT 1
    ),
    30
  )
  INTO offer_seconds;

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
      now() + make_interval(secs => offer_seconds)
    )
    ON CONFLICT (job_id, rider_id, attempt) DO NOTHING;

    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$function$;
