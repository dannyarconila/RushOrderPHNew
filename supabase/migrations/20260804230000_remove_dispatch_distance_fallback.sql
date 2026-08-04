-- Remove hardcoded 3km dispatch fallback. If coordinates are unavailable,
-- dispatch distance falls back to order distance then zero.
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

  INSERT INTO public.dispatch_jobs (
    order_id, store_id, status, radius_km, attempt, max_attempts, distance_km, delivery_fee,
    store_name, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng
  ) VALUES (
    _order_id, o.store_id, 'searching',
    COALESCE((s->>'dispatch_radius_km')::numeric, 5), 1,
    COALESCE((s->>'dispatch_max_retries')::int, 5),
    dist, fee, st.name, pickup, dropoff, st.latitude, st.longitude, ad.latitude, ad.longitude
  )
  ON CONFLICT (order_id) DO UPDATE
    SET status = CASE WHEN public.dispatch_jobs.status IN ('cancelled','failed') THEN 'searching' ELSE public.dispatch_jobs.status END,
        updated_at = now()
  RETURNING id INTO job_id;

  PERFORM public.dispatch_broadcast(job_id);

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (o.customer_id, 'Searching for a rider',
    'Your order is ready and we are finding a nearby rider.', 'dispatch');

  RETURN job_id;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_start(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_start(uuid) TO authenticated, service_role;
