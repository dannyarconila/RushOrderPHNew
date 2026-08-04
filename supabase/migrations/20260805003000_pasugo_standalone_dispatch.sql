-- Standalone Pasugo / Errands booking flow.
-- Independent from marketplace orders, seller workflow, and checkout.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'pasugo_booking_status'
  ) THEN
    CREATE TYPE public.pasugo_booking_status AS ENUM (
      'requested',
      'finding_rider',
      'accepted',
      'rider_arriving',
      'picked_up',
      'on_the_way',
      'delivered',
      'completed',
      'cancelled',
      'failed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pasugo_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name text,
  customer_phone text,
  pickup_address text NOT NULL,
  dropoff_address text NOT NULL,
  pickup_lat numeric,
  pickup_lng numeric,
  dropoff_lat numeric,
  dropoff_lng numeric,
  notes text,
  estimated_distance_km numeric NOT NULL DEFAULT 0,
  estimated_fare numeric NOT NULL DEFAULT 0,
  status public.pasugo_booking_status NOT NULL DEFAULT 'requested',
  assigned_rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pasugo_bookings_customer ON public.pasugo_bookings (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pasugo_bookings_status ON public.pasugo_bookings (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pasugo_bookings_rider ON public.pasugo_bookings (assigned_rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pasugo_dispatch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL UNIQUE REFERENCES public.pasugo_bookings(id) ON DELETE CASCADE,
  status public.dispatch_status NOT NULL DEFAULT 'searching',
  radius_km numeric NOT NULL DEFAULT 5,
  attempt int NOT NULL DEFAULT 1,
  max_attempts int NOT NULL DEFAULT 5,
  distance_km numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  pickup_address text,
  dropoff_address text,
  pickup_lat numeric,
  pickup_lng numeric,
  dropoff_lat numeric,
  dropoff_lng numeric,
  expires_at timestamptz,
  assigned_rider_id uuid,
  assigned_at timestamptz,
  last_attempt_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pasugo_dispatch_jobs_status ON public.pasugo_dispatch_jobs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pasugo_dispatch_jobs_rider ON public.pasugo_dispatch_jobs (assigned_rider_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pasugo_dispatch_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.pasugo_dispatch_jobs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.pasugo_bookings(id) ON DELETE CASCADE,
  rider_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  attempt int NOT NULL,
  distance_km numeric,
  status public.dispatch_offer_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, rider_id, attempt)
);

CREATE INDEX IF NOT EXISTS idx_pasugo_dispatch_offers_rider ON public.pasugo_dispatch_offers (rider_id, status);
CREATE INDEX IF NOT EXISTS idx_pasugo_dispatch_offers_job ON public.pasugo_dispatch_offers (job_id, status);

GRANT SELECT, INSERT ON public.pasugo_bookings TO authenticated;
GRANT ALL ON public.pasugo_bookings TO service_role;
GRANT SELECT ON public.pasugo_dispatch_jobs TO authenticated;
GRANT ALL ON public.pasugo_dispatch_jobs TO service_role;
GRANT SELECT ON public.pasugo_dispatch_offers TO authenticated;
GRANT ALL ON public.pasugo_dispatch_offers TO service_role;

ALTER TABLE public.pasugo_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasugo_dispatch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pasugo_dispatch_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pasugo_bookings_read ON public.pasugo_bookings;
CREATE POLICY pasugo_bookings_read ON public.pasugo_bookings
FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR assigned_rider_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS pasugo_bookings_insert ON public.pasugo_bookings;
CREATE POLICY pasugo_bookings_insert ON public.pasugo_bookings
FOR INSERT TO authenticated
WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS pasugo_bookings_update_customer ON public.pasugo_bookings;
CREATE POLICY pasugo_bookings_update_customer ON public.pasugo_bookings
FOR UPDATE TO authenticated
USING (customer_id = auth.uid())
WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS pasugo_dispatch_jobs_read ON public.pasugo_dispatch_jobs;
CREATE POLICY pasugo_dispatch_jobs_read ON public.pasugo_dispatch_jobs
FOR SELECT TO authenticated
USING (
  assigned_rider_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.pasugo_bookings b
    WHERE b.id = pasugo_dispatch_jobs.booking_id
      AND b.customer_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS pasugo_dispatch_offers_read ON public.pasugo_dispatch_offers;
CREATE POLICY pasugo_dispatch_offers_read ON public.pasugo_dispatch_offers
FOR SELECT TO authenticated
USING (rider_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.pasugo_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pasugo_bookings_updated ON public.pasugo_bookings;
CREATE TRIGGER trg_pasugo_bookings_updated
BEFORE UPDATE ON public.pasugo_bookings
FOR EACH ROW EXECUTE FUNCTION public.pasugo_touch_updated_at();

DROP TRIGGER IF EXISTS trg_pasugo_dispatch_jobs_updated ON public.pasugo_dispatch_jobs;
CREATE TRIGGER trg_pasugo_dispatch_jobs_updated
BEFORE UPDATE ON public.pasugo_dispatch_jobs
FOR EACH ROW EXECUTE FUNCTION public.pasugo_touch_updated_at();

DROP TRIGGER IF EXISTS trg_pasugo_dispatch_offers_updated ON public.pasugo_dispatch_offers;
CREATE TRIGGER trg_pasugo_dispatch_offers_updated
BEFORE UPDATE ON public.pasugo_dispatch_offers
FOR EACH ROW EXECUTE FUNCTION public.pasugo_touch_updated_at();

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_broadcast(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  s jsonb := public.dispatch_settings();
  timeout_s integer := COALESCE((s->>'dispatch_timeout_seconds')::int, 30);
  strategy text := COALESCE(s->>'dispatch_strategy', 'nearest_first');
  sent integer := 0;
  cap integer;
  r record;
BEGIN
  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN 0; END IF;

  cap := CASE strategy WHEN 'nearest_first' THEN 1 WHEN 'wave' THEN 3 ELSE 50 END;

  FOR r IN
    SELECT rs.user_id,
           public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) AS dist
    FROM public.rider_status rs
    JOIN public.user_roles ur ON ur.user_id = rs.user_id AND ur.role = 'rider'
    JOIN public.profiles p ON p.id = rs.user_id
    LEFT JOIN public.wallets w ON w.user_id = rs.user_id AND w.wallet_type = 'rider' AND w.deleted_at IS NULL
    WHERE rs.is_online
      AND rs.is_available
      AND p.account_status = 'active'
      AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
      AND (
        public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) IS NULL
        OR public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) <= j.radius_km
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.pasugo_dispatch_offers o
        WHERE o.job_id = j.id
          AND o.rider_id = rs.user_id
          AND o.status = 'declined'
      )
    ORDER BY dist NULLS LAST, rs.last_seen_at DESC
    LIMIT cap
  LOOP
    INSERT INTO public.pasugo_dispatch_offers (job_id, booking_id, rider_id, attempt, distance_km, expires_at)
    VALUES (j.id, j.booking_id, r.user_id, j.attempt, r.dist, now() + make_interval(secs => timeout_s))
    ON CONFLICT (job_id, rider_id, attempt) DO NOTHING;

    IF FOUND THEN
      sent := sent + 1;
      INSERT INTO public.notifications (user_id, title, body, kind)
      VALUES (
        r.user_id,
        'New Pasugo booking',
        'A nearby customer needs errand help — PHP ' || to_char(j.delivery_fee, 'FM999999990.00'),
        'dispatch'
      );
    END IF;
  END LOOP;

  UPDATE public.pasugo_dispatch_jobs
  SET expires_at = now() + make_interval(secs => timeout_s), last_attempt_at = now(), updated_at = now()
  WHERE id = j.id;

  RETURN sent;
END;
$$;

CREATE OR REPLACE FUNCTION public.pasugo_start(_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  dist numeric;
  fee numeric;
  job_id uuid;
BEGIN
  SELECT * INTO b FROM public.pasugo_bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  IF uid IS NOT NULL AND uid <> b.customer_id AND NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'You are not allowed to start this booking.';
  END IF;

  IF b.status IN ('cancelled', 'completed') THEN
    RETURN NULL;
  END IF;

  dist := COALESCE(
    public.haversine_km(b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng),
    NULLIF(b.estimated_distance_km, 0),
    0
  );

  fee := GREATEST(
    COALESCE((s->>'dispatch_min_fee')::numeric, 49),
    LEAST(
      COALESCE((s->>'dispatch_max_fee')::numeric, 300),
      round(dist * COALESCE((s->>'dispatch_fee_per_km')::numeric, 15), 2)
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
  ) VALUES (
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
    SET status = CASE WHEN public.pasugo_dispatch_jobs.status IN ('cancelled', 'failed') THEN 'searching' ELSE public.pasugo_dispatch_jobs.status END,
        updated_at = now()
  RETURNING id INTO job_id;

  UPDATE public.pasugo_bookings
  SET status = 'finding_rider',
      estimated_distance_km = dist,
      estimated_fare = fee,
      updated_at = now()
  WHERE id = b.id;

  PERFORM public.pasugo_dispatch_broadcast(job_id);

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (b.customer_id, 'Finding a rider', 'We are searching for nearby riders for your Pasugo booking.', 'dispatch');

  RETURN job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_start(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_start(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_retry(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  s jsonb := public.dispatch_settings();
  next_radius numeric;
BEGIN
  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN false; END IF;
  IF j.expires_at IS NOT NULL AND j.expires_at > now() THEN RETURN false; END IF;

  UPDATE public.pasugo_dispatch_offers SET status = 'expired', updated_at = now()
  WHERE job_id = j.id AND status = 'pending' AND expires_at <= now();

  IF j.attempt >= COALESCE(j.max_attempts, 5) THEN
    UPDATE public.pasugo_dispatch_jobs SET status = 'failed', updated_at = now() WHERE id = j.id;
    UPDATE public.pasugo_bookings SET status = 'failed', updated_at = now() WHERE id = j.booking_id;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT b.customer_id, 'No rider available', 'No rider accepted your Pasugo booking.', 'dispatch'
    FROM public.pasugo_bookings b
    WHERE b.id = j.booking_id;
    RETURN false;
  END IF;

  next_radius := j.radius_km;
  IF COALESCE((s->>'dispatch_auto_expand')::boolean, true) THEN
    next_radius := LEAST(
      COALESCE((s->>'dispatch_max_radius_km')::numeric, 10),
      j.radius_km + COALESCE((s->>'dispatch_radius_expansion_km')::numeric, 2)
    );
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET attempt = j.attempt + 1,
      radius_km = next_radius,
      updated_at = now()
  WHERE id = j.id;

  PERFORM public.pasugo_dispatch_broadcast(j.id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_retry(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_retry(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_available_riders_count(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  cnt integer;
BEGIN
  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT COUNT(*)::int INTO cnt
  FROM public.rider_status rs
  JOIN public.user_roles ur ON ur.user_id = rs.user_id AND ur.role = 'rider'
  JOIN public.profiles p ON p.id = rs.user_id
  LEFT JOIN public.wallets w ON w.user_id = rs.user_id AND w.wallet_type = 'rider' AND w.deleted_at IS NULL
  WHERE rs.is_online
    AND rs.is_available
    AND p.account_status = 'active'
    AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
    AND (
      public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) IS NULL
      OR public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) <= j.radius_km
    );

  RETURN COALESCE(cnt, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_available_riders_count(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_available_riders_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF NOT public.has_role(uid, 'rider') THEN RAISE EXCEPTION 'Only approved riders can accept bookings.'; END IF;

  required_balance := public.minimum_wallet_balance_for_role('rider');
  SELECT balance INTO current_balance
  FROM public.wallets
  WHERE user_id = uid AND wallet_type = 'rider' AND deleted_at IS NULL
  LIMIT 1;

  IF current_balance IS NULL OR current_balance < required_balance THEN
    RAISE EXCEPTION 'Your rider wallet balance must be at least ₱% to accept bookings.', required_balance;
  END IF;

  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.pasugo_dispatch_offers WHERE job_id = j.id AND rider_id = uid) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching' OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET status = 'assigned', assigned_rider_id = uid, assigned_at = now(), expires_at = NULL, updated_at = now()
  WHERE id = j.id;

  UPDATE public.pasugo_dispatch_offers SET status = 'accepted', responded_at = now()
  WHERE job_id = j.id AND rider_id = uid;

  UPDATE public.pasugo_dispatch_offers SET status = 'cancelled', responded_at = now()
  WHERE job_id = j.id AND rider_id <> uid AND status = 'pending';

  UPDATE public.rider_status
  SET is_available = false, updated_at = now()
  WHERE user_id = uid;

  UPDATE public.pasugo_bookings
  SET assigned_rider_id = uid,
      status = 'accepted',
      updated_at = now()
  WHERE id = j.booking_id;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (b.customer_id, 'Rider assigned', 'A rider accepted your Pasugo booking.', 'dispatch');

  RETURN jsonb_build_object('ok', true, 'booking_id', j.booking_id);
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_accept(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_accept(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_decline(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  UPDATE public.pasugo_dispatch_offers
  SET status = 'declined', responded_at = now(), updated_at = now()
  WHERE job_id = _job_id
    AND rider_id = uid
    AND status = 'pending';

  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_decline(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_decline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_advance(_job_id uuid, _step text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.assigned_rider_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'This booking is not assigned to you.';
  END IF;

  IF _step = 'arrived' THEN
    UPDATE public.pasugo_bookings
    SET status = 'rider_arriving',
        updated_at = now()
    WHERE id = j.booking_id;

  ELSIF _step = 'picked_up' THEN
    UPDATE public.pasugo_dispatch_jobs
    SET status = 'picked_up',
        picked_up_at = now(),
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET status = 'on_the_way',
        updated_at = now()
    WHERE id = j.booking_id;

  ELSIF _step = 'delivered' THEN
    UPDATE public.pasugo_dispatch_jobs
    SET status = 'delivered',
        delivered_at = now(),
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET status = 'delivered',
        updated_at = now()
    WHERE id = j.booking_id;

    UPDATE public.rider_status
    SET is_available = true,
        updated_at = now()
    WHERE user_id = uid;

  ELSIF _step = 'completed' THEN
    UPDATE public.pasugo_bookings
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = j.booking_id;

    UPDATE public.rider_status
    SET is_available = true,
        updated_at = now()
    WHERE user_id = uid;

  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_advance(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_advance(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_cancel(_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  b public.pasugo_bookings%ROWTYPE;
  j public.pasugo_dispatch_jobs%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;
  IF b.customer_id <> uid AND NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'You are not authorized to cancel this booking.';
  END IF;

  IF b.status IN ('delivered', 'completed', 'cancelled') THEN
    RETURN false;
  END IF;

  UPDATE public.pasugo_bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      updated_at = now()
  WHERE id = b.id;

  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE booking_id = b.id;
  IF FOUND THEN
    UPDATE public.pasugo_dispatch_jobs
    SET status = 'cancelled', updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_dispatch_offers
    SET status = CASE WHEN status = 'accepted' THEN status ELSE 'cancelled' END,
        responded_at = COALESCE(responded_at, now()),
        updated_at = now()
    WHERE job_id = j.id AND status IN ('pending', 'sent', 'expired', 'declined', 'cancelled');
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_cancel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_cancel(uuid) TO authenticated, service_role;

ALTER TABLE public.pasugo_bookings REPLICA IDENTITY FULL;
ALTER TABLE public.pasugo_dispatch_jobs REPLICA IDENTITY FULL;
ALTER TABLE public.pasugo_dispatch_offers REPLICA IDENTITY FULL;

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pasugo_bookings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pasugo_dispatch_jobs; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pasugo_dispatch_offers; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
