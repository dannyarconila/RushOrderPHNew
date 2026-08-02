-- ============ settings ============
INSERT INTO public.system_settings (key, value, description, is_public) VALUES
  ('dispatch_radius_km', to_jsonb(5), 'Initial dispatch radius in kilometres', false),
  ('dispatch_max_radius_km', to_jsonb(10), 'Maximum dispatch radius in kilometres', false),
  ('dispatch_fee_per_km', to_jsonb(15), 'Delivery fee per kilometre (PHP)', false),
  ('dispatch_min_fee', to_jsonb(49), 'Minimum delivery fee (PHP)', false),
  ('dispatch_max_fee', to_jsonb(300), 'Maximum delivery fee (PHP)', false),
  ('dispatch_timeout_seconds', to_jsonb(30), 'Seconds a rider has to accept a booking', false),
  ('dispatch_retry_interval_seconds', to_jsonb(15), 'Seconds between dispatch retries', false),
  ('dispatch_max_retries', to_jsonb(5), 'Maximum dispatch retry attempts', false),
  ('dispatch_auto_expand', to_jsonb(true), 'Automatically expand the radius between retries', false),
  ('dispatch_radius_expansion_km', to_jsonb(2), 'Radius added on each retry when auto-expand is on', false),
  ('dispatch_strategy', to_jsonb('nearest_first'::text), 'nearest_first | broadcast | wave', false)
ON CONFLICT (key) DO NOTHING;

-- ============ enums ============
DO $$ BEGIN CREATE TYPE public.dispatch_status AS ENUM ('searching','assigned','picked_up','delivered','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.dispatch_offer_status AS ENUM ('pending','accepted','declined','expired','cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ addresses geo ============
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS latitude numeric;
ALTER TABLE public.addresses ADD COLUMN IF NOT EXISTS longitude numeric;

-- ============ rider_status ============
CREATE TABLE IF NOT EXISTS public.rider_status (
  user_id uuid PRIMARY KEY,
  is_online boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  latitude numeric,
  longitude numeric,
  vehicle_type text,
  plate_number text,
  active_order_id uuid,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.rider_status TO authenticated;
GRANT ALL ON public.rider_status TO service_role;
ALTER TABLE public.rider_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rider_status_manage_own ON public.rider_status;
CREATE POLICY rider_status_manage_own ON public.rider_status FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS rider_status_read_authenticated ON public.rider_status;
CREATE POLICY rider_status_read_authenticated ON public.rider_status FOR SELECT TO authenticated USING (true);
DROP TRIGGER IF EXISTS trg_rider_status_updated ON public.rider_status;
CREATE TRIGGER trg_rider_status_updated BEFORE UPDATE ON public.rider_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ dispatch_jobs ============
CREATE TABLE IF NOT EXISTS public.dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  store_id uuid,
  status public.dispatch_status NOT NULL DEFAULT 'searching',
  assigned_rider_id uuid,
  assigned_at timestamptz,
  radius_km numeric NOT NULL DEFAULT 5,
  attempt integer NOT NULL DEFAULT 1,
  max_attempts integer NOT NULL DEFAULT 5,
  distance_km numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  store_name text,
  pickup_address text,
  dropoff_address text,
  pickup_lat numeric, pickup_lng numeric,
  dropoff_lat numeric, dropoff_lng numeric,
  expires_at timestamptz,
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dispatch_jobs TO authenticated;
GRANT ALL ON public.dispatch_jobs TO service_role;
ALTER TABLE public.dispatch_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_jobs_read ON public.dispatch_jobs;
CREATE POLICY dispatch_jobs_read ON public.dispatch_jobs FOR SELECT TO authenticated
  USING (
    assigned_rider_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = dispatch_jobs.order_id AND o.customer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = dispatch_jobs.store_id AND s.owner_id = auth.uid())
  );
DROP TRIGGER IF EXISTS trg_dispatch_jobs_updated ON public.dispatch_jobs;
CREATE TRIGGER trg_dispatch_jobs_updated BEFORE UPDATE ON public.dispatch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ dispatch_offers ============
CREATE TABLE IF NOT EXISTS public.dispatch_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.dispatch_jobs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  rider_id uuid NOT NULL,
  status public.dispatch_offer_status NOT NULL DEFAULT 'pending',
  attempt integer NOT NULL DEFAULT 1,
  distance_km numeric,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds'),
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, rider_id, attempt)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_offers_rider ON public.dispatch_offers (rider_id, status);
GRANT SELECT ON public.dispatch_offers TO authenticated;
GRANT ALL ON public.dispatch_offers TO service_role;
ALTER TABLE public.dispatch_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dispatch_offers_read_own ON public.dispatch_offers;
CREATE POLICY dispatch_offers_read_own ON public.dispatch_offers FOR SELECT TO authenticated
  USING (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
DROP TRIGGER IF EXISTS trg_dispatch_offers_updated ON public.dispatch_offers;
CREATE TRIGGER trg_dispatch_offers_updated BEFORE UPDATE ON public.dispatch_offers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- riders offered a job may read it
DROP POLICY IF EXISTS dispatch_jobs_read_offered ON public.dispatch_jobs;
CREATE POLICY dispatch_jobs_read_offered ON public.dispatch_jobs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dispatch_offers f WHERE f.job_id = dispatch_jobs.id AND f.rider_id = auth.uid()));

-- ============ helpers ============
CREATE OR REPLACE FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN NULL
    ELSE round((6371 * 2 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
    )))::numeric, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  FROM public.system_settings WHERE key LIKE 'dispatch\_%';
$$;
REVOKE ALL ON FUNCTION public.dispatch_settings() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_settings() TO authenticated, service_role;

-- ============ broadcast ============
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
     WHERE rs.is_online AND rs.is_available
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

-- ============ start ============
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
    3
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

-- automatic trigger when the seller marks the order ready
CREATE OR REPLACE FUNCTION public.trg_order_ready_dispatch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'ready' AND OLD.status IS DISTINCT FROM 'ready' THEN
    PERFORM public.dispatch_start(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_orders_ready_dispatch ON public.orders;
CREATE TRIGGER trg_orders_ready_dispatch AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_order_ready_dispatch();

-- ============ retry ============
CREATE OR REPLACE FUNCTION public.dispatch_retry(_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  s jsonb := public.dispatch_settings();
  next_radius numeric;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN false; END IF;
  IF j.expires_at IS NOT NULL AND j.expires_at > now() THEN RETURN false; END IF;

  UPDATE public.dispatch_offers SET status = 'expired', updated_at = now()
   WHERE job_id = j.id AND status = 'pending' AND expires_at <= now();

  IF j.attempt >= COALESCE(j.max_attempts, 5) THEN
    UPDATE public.dispatch_jobs SET status = 'failed', updated_at = now() WHERE id = j.id;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT st.owner_id, 'No rider available', 'We could not find a rider for order ' || COALESCE(o.claim_number, left(o.id::text, 8)) || '.', 'dispatch'
      FROM public.orders o JOIN public.stores st ON st.id = o.store_id WHERE o.id = j.order_id;
    RETURN false;
  END IF;

  next_radius := j.radius_km;
  IF COALESCE((s->>'dispatch_auto_expand')::boolean, true) THEN
    next_radius := LEAST(
      COALESCE((s->>'dispatch_max_radius_km')::numeric, 10),
      j.radius_km + COALESCE((s->>'dispatch_radius_expansion_km')::numeric, 2)
    );
  END IF;

  UPDATE public.dispatch_jobs
     SET attempt = j.attempt + 1, radius_km = next_radius, updated_at = now()
   WHERE id = j.id;

  PERFORM public.dispatch_broadcast(j.id);
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_retry(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_retry(uuid) TO authenticated, service_role;

-- ============ accept / decline ============
CREATE OR REPLACE FUNCTION public.dispatch_accept(_job_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF NOT public.has_role(uid, 'rider') THEN RAISE EXCEPTION 'Only approved riders can accept deliveries.'; END IF;

  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.dispatch_offers WHERE job_id = j.id AND rider_id = uid) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching' OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  UPDATE public.dispatch_jobs
     SET status = 'assigned', assigned_rider_id = uid, assigned_at = now(), expires_at = NULL, updated_at = now()
   WHERE id = j.id;

  UPDATE public.dispatch_offers SET status = 'accepted', responded_at = now()
   WHERE job_id = j.id AND rider_id = uid;
  UPDATE public.dispatch_offers SET status = 'cancelled', responded_at = now()
   WHERE job_id = j.id AND rider_id <> uid AND status = 'pending';

  UPDATE public.rider_status
     SET is_available = false, active_order_id = j.order_id, updated_at = now()
   WHERE user_id = uid;

  UPDATE public.orders SET rider_id = uid, updated_at = now() WHERE id = j.order_id;
  SELECT * INTO o FROM public.orders WHERE id = j.order_id;

  INSERT INTO public.deliveries (order_id, rider_id, status, pickup_address, dropoff_address, fee, distance_km, claim_number, accepted_at)
  VALUES (j.order_id, uid, 'assigned',
          jsonb_build_object('text', j.pickup_address), jsonb_build_object('text', j.dropoff_address),
          j.delivery_fee, j.distance_km, o.claim_number, now())
  ON CONFLICT (order_id) DO UPDATE
     SET rider_id = EXCLUDED.rider_id, status = 'assigned', accepted_at = now(), updated_at = now();

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (o.customer_id, 'Rider assigned', 'A rider is on the way to pick up your order.', 'dispatch');
  INSERT INTO public.notifications (user_id, title, body, kind)
  SELECT st.owner_id, 'Rider assigned', 'A rider accepted the delivery for order ' || COALESCE(o.claim_number, left(o.id::text, 8)) || '.', 'dispatch'
    FROM public.stores st WHERE st.id = j.store_id;

  RETURN jsonb_build_object('ok', true, 'order_id', j.order_id);
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_accept(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_accept(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_decline(_job_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  UPDATE public.dispatch_offers SET status = 'declined', responded_at = now()
   WHERE job_id = _job_id AND rider_id = uid AND status = 'pending';
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_decline(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_decline(uuid) TO authenticated, service_role;

-- ============ rider presence + trip steps ============
CREATE OR REPLACE FUNCTION public.rider_set_presence(_online boolean, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF NOT public.has_role(uid, 'rider') THEN RAISE EXCEPTION 'Only approved riders can go online.'; END IF;
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

CREATE OR REPLACE FUNCTION public.dispatch_advance(_job_id uuid, _step text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.assigned_rider_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'This delivery is not assigned to you.';
  END IF;

  IF _step = 'picked_up' THEN
    UPDATE public.dispatch_jobs SET status = 'picked_up', picked_up_at = now(), updated_at = now() WHERE id = j.id;
    UPDATE public.orders SET status = 'picked_up', updated_at = now() WHERE id = j.order_id;
    UPDATE public.deliveries SET status = 'picked_up', updated_at = now() WHERE order_id = j.order_id;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT o.customer_id, 'On the way', 'Your rider has picked up your order.', 'dispatch'
      FROM public.orders o WHERE o.id = j.order_id;
  ELSIF _step = 'delivered' THEN
    UPDATE public.dispatch_jobs SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE id = j.id;
    UPDATE public.orders SET status = 'delivered', updated_at = now() WHERE id = j.order_id;
    UPDATE public.deliveries SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE order_id = j.order_id;
    UPDATE public.rider_status SET is_available = true, active_order_id = NULL, updated_at = now() WHERE user_id = uid;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT o.customer_id, 'Delivered', 'Your order has been delivered. Enjoy!', 'dispatch'
      FROM public.orders o WHERE o.id = j.order_id;
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.dispatch_advance(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_advance(uuid, text) TO authenticated, service_role;

-- one delivery per order (needed for the accept upsert)
CREATE UNIQUE INDEX IF NOT EXISTS deliveries_order_id_key ON public.deliveries (order_id);

-- ============ realtime ============
ALTER TABLE public.dispatch_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.dispatch_offers REPLICA IDENTITY FULL;
ALTER TABLE public.rider_status REPLICA IDENTITY FULL;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_jobs; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_offers; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_status; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries; EXCEPTION WHEN duplicate_object THEN NULL; END $$;