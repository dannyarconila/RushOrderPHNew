-- Unify Pasugo on the shared dispatch pipeline.
-- Keep the same dispatch engine/realtime/offer/accept path, with only payload differences.

ALTER TABLE public.dispatch_jobs
  ADD COLUMN IF NOT EXISTS dispatch_type text NOT NULL DEFAULT 'marketplace',
  ADD COLUMN IF NOT EXISTS customer_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'dispatch_jobs_dispatch_type_check'
  ) THEN
    ALTER TABLE public.dispatch_jobs
      ADD CONSTRAINT dispatch_jobs_dispatch_type_check
      CHECK (dispatch_type IN ('marketplace', 'pasugo'));
  END IF;
END $$;

UPDATE public.dispatch_jobs j
SET dispatch_type = CASE
      WHEN COALESCE(o.notes, '') LIKE '[PASUGO]%' THEN 'pasugo'
      ELSE 'marketplace'
    END,
    customer_notes = CASE
      WHEN COALESCE(o.notes, '') LIKE '[PASUGO]%' THEN NULLIF(split_part(regexp_replace(o.notes, '^\\[PASUGO\\]\\s*', ''), E'\n', 1), '')
      ELSE j.customer_notes
    END,
    updated_at = now()
FROM public.orders o
WHERE o.id = j.order_id
  AND (
    j.dispatch_type IS DISTINCT FROM CASE
      WHEN COALESCE(o.notes, '') LIKE '[PASUGO]%' THEN 'pasugo'
      ELSE 'marketplace'
    END
    OR (
      COALESCE(o.notes, '') LIKE '[PASUGO]%'
      AND j.customer_notes IS DISTINCT FROM NULLIF(split_part(regexp_replace(o.notes, '^\\[PASUGO\\]\\s*', ''), E'\n', 1), '')
    )
  );

CREATE OR REPLACE FUNCTION public.dispatch_broadcast(_job_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  s jsonb := public.dispatch_settings();
  timeout_s integer := COALESCE((s->>'dispatch_timeout_seconds')::int, 30);
  strategy text := COALESCE(s->>'dispatch_strategy', 'nearest_first');
  sent integer := 0;
  r record;
  cap integer;
  rider_title text;
  rider_body text;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN 0; END IF;

  cap := CASE strategy WHEN 'nearest_first' THEN 1 WHEN 'wave' THEN 3 ELSE 50 END;

  FOR r IN
    SELECT rs.user_id,
           public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) AS dist
      FROM public.rider_status rs
      JOIN public.user_roles ur ON ur.user_id = rs.user_id AND ur.role = 'rider'
      JOIN public.profiles p ON p.id = rs.user_id
      JOIN public.wallets w ON w.user_id = rs.user_id AND w.wallet_type = 'rider' AND w.deleted_at IS NULL
     WHERE rs.is_online AND rs.is_available
       AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
       AND p.account_status = 'active'
       AND (
         public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) IS NULL
         OR public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) <= j.radius_km
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.dispatch_offers o
          WHERE o.job_id = j.id AND o.rider_id = rs.user_id AND o.status = 'declined'
       )
     ORDER BY dist NULLS LAST, rs.last_seen_at DESC
     LIMIT cap
  LOOP
    INSERT INTO public.dispatch_offers (job_id, order_id, rider_id, attempt, distance_km, expires_at)
    VALUES (j.id, j.order_id, r.user_id, j.attempt, r.dist, now() + make_interval(secs => timeout_s))
    ON CONFLICT (job_id, rider_id, attempt) DO NOTHING;

    IF FOUND THEN
      sent := sent + 1;
      rider_title := CASE WHEN j.dispatch_type = 'pasugo' THEN 'New Pasugo booking' ELSE 'New delivery request' END;
      rider_body := CASE
        WHEN j.dispatch_type = 'pasugo'
          THEN 'A nearby customer needs errand help — PHP ' || to_char(j.delivery_fee, 'FM999999990.00')
        ELSE COALESCE(j.store_name, 'A store') || ' needs a rider — PHP ' || to_char(j.delivery_fee, 'FM999999990.00')
      END;
      INSERT INTO public.notifications (user_id, title, body, kind)
      VALUES (r.user_id, rider_title, rider_body, 'dispatch');
    END IF;
  END LOOP;

  UPDATE public.dispatch_jobs
     SET expires_at = now() + make_interval(secs => timeout_s), last_attempt_at = now(), updated_at = now()
   WHERE id = j.id;

  RETURN sent;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_broadcast(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_broadcast(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_start(_order_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.orders%ROWTYPE;
  st public.stores%ROWTYPE;
  ad public.addresses%ROWTYPE;
  s jsonb := public.dispatch_settings();
  dist numeric;
  fee numeric;
  job_id uuid;
  pickup text;
  dropoff text;
  job_dispatch_type text := 'marketplace';
  job_customer_notes text := NULL;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id;
  IF NOT FOUND OR o.status = 'cancelled' THEN RETURN NULL; END IF;

  SELECT * INTO st FROM public.stores WHERE id = o.store_id;
  IF o.address_id IS NOT NULL THEN SELECT * INTO ad FROM public.addresses WHERE id = o.address_id; END IF;

  dist := COALESCE(
    public.haversine_km(st.latitude, st.longitude, ad.latitude, ad.longitude),
    NULLIF(o.distance_km, 0),
    0
  );
  fee := GREATEST(
    COALESCE((s->>'dispatch_min_fee')::numeric, 49),
    LEAST(COALESCE((s->>'dispatch_max_fee')::numeric, 300),
          round(dist * COALESCE((s->>'dispatch_fee_per_km')::numeric, 15), 2))
  );

  pickup := COALESCE(NULLIF(btrim(concat_ws(', ', st.address->>'line1', st.address->>'barangay', st.address->>'city')), ''), st.name);
  dropoff := COALESCE(NULLIF(btrim(concat_ws(', ', ad.line1, ad.barangay, ad.city)), ''), 'Customer address');

  IF COALESCE(o.notes, '') LIKE '[PASUGO]%' THEN
    job_dispatch_type := 'pasugo';
    job_customer_notes := NULLIF(split_part(regexp_replace(o.notes, '^\\[PASUGO\\]\\s*', ''), E'\n', 1), '');
  END IF;

  INSERT INTO public.dispatch_jobs (
    order_id, store_id, status, radius_km, attempt, max_attempts, distance_km, delivery_fee,
    store_name, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    dispatch_type, customer_notes
  ) VALUES (
    _order_id, o.store_id, 'searching',
    COALESCE((s->>'dispatch_radius_km')::numeric, 5), 1,
    COALESCE((s->>'dispatch_max_retries')::int, 5),
    dist, fee, st.name, pickup, dropoff, st.latitude, st.longitude, ad.latitude, ad.longitude,
    job_dispatch_type, job_customer_notes
  )
  ON CONFLICT (order_id) DO UPDATE
    SET status = CASE WHEN public.dispatch_jobs.status IN ('cancelled','failed') THEN 'searching' ELSE public.dispatch_jobs.status END,
        dispatch_type = EXCLUDED.dispatch_type,
        customer_notes = EXCLUDED.customer_notes,
        updated_at = now()
  RETURNING id INTO job_id;

  PERFORM public.dispatch_broadcast(job_id);

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (
    o.customer_id,
    CASE WHEN job_dispatch_type = 'pasugo' THEN 'Finding a rider' ELSE 'Searching for a rider' END,
    CASE WHEN job_dispatch_type = 'pasugo'
      THEN 'We are searching for nearby riders for your Pasugo booking.'
      ELSE 'Your order is ready and we are finding a nearby rider.'
    END,
    'dispatch'
  );

  RETURN job_id;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_start(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_start(uuid) TO authenticated, service_role;
