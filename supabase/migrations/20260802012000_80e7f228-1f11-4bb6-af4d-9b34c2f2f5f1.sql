-- ============ wallet threshold enforcement ============

CREATE OR REPLACE FUNCTION public.minimum_wallet_balance_for_role(_role text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT (value)::numeric FROM public.system_settings
     WHERE key = CASE
       WHEN _role = 'rider' THEN 'minimum_rider_wallet_balance'
       WHEN _role = 'seller' THEN 'minimum_seller_wallet_balance'
       ELSE NULL
     END
    ),
    0
  );
$$;
REVOKE ALL ON FUNCTION public.minimum_wallet_balance_for_role(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.minimum_wallet_balance_for_role(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.store_set_online(_store_id uuid, _online boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
  store_owner uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT owner_id INTO store_owner FROM public.stores WHERE id = _store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found.';
  END IF;

  IF store_owner IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'You are not authorized to manage this store.';
  END IF;

  IF _online THEN
    required_balance := public.minimum_wallet_balance_for_role('seller');
    SELECT balance INTO current_balance
      FROM public.wallets
     WHERE user_id = uid
       AND wallet_type = 'seller'
       AND deleted_at IS NULL
     LIMIT 1;

    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'A seller wallet is required before your store can go online.';
    ELSIF current_balance < required_balance THEN
      RAISE EXCEPTION 'Your wallet balance must be at least ₱% to take your store online.', required_balance;
    END IF;
  END IF;

  UPDATE public.stores
     SET is_online = _online,
         updated_at = now()
   WHERE id = _store_id;

  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.store_set_online(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.store_set_online(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rider_set_presence(_online boolean, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;
  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can go online.';
  END IF;

  IF _online THEN
    required_balance := public.minimum_wallet_balance_for_role('rider');
    SELECT balance INTO current_balance
      FROM public.wallets
     WHERE user_id = uid
       AND wallet_type = 'rider'
       AND deleted_at IS NULL
     LIMIT 1;

    IF current_balance IS NULL THEN
      RAISE EXCEPTION 'A rider wallet is required before you can go online.';
    ELSIF current_balance < required_balance THEN
      RAISE EXCEPTION 'Your wallet balance must be at least ₱% to go online.', required_balance;
    END IF;
  END IF;

  INSERT INTO public.rider_status (user_id, is_online, latitude, longitude, last_seen_at)
  VALUES (uid, _online, _lat, _lng, now())
  ON CONFLICT (user_id) DO UPDATE
    SET is_online = EXCLUDED.is_online,
        latitude = COALESCE(EXCLUDED.latitude, public.rider_status.latitude),
        longitude = COALESCE(EXCLUDED.longitude, public.rider_status.longitude),
        last_seen_at = now(), updated_at = now();
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.rider_set_presence(boolean, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rider_set_presence(boolean, numeric, numeric) TO authenticated, service_role;

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
      INSERT INTO public.notifications (user_id, title, body, kind)
      VALUES (r.user_id, 'New delivery request',
        COALESCE(j.store_name, 'A store') || ' needs a rider — PHP ' || to_char(j.delivery_fee, 'FM999999990.00'),
        'dispatch');
    END IF;
  END LOOP;

  UPDATE public.dispatch_jobs
     SET expires_at = now() + make_interval(secs => timeout_s), last_attempt_at = now(), updated_at = now()
   WHERE id = j.id;

  RETURN sent;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_broadcast(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_broadcast(uuid) TO authenticated, service_role;
