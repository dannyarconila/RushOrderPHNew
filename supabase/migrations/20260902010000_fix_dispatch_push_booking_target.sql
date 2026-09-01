-- Fix rider dispatch push notifications:
-- 1. Store the exact dispatch offer ID on the notification.
-- 2. Store whether the offer belongs to marketplace or Pasugo.
-- 3. Remove the duplicate marketplace notification created directly
--    inside dispatch_broadcast(); the dispatch_offers trigger becomes
--    the single notification source.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dispatch_offer_id uuid;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dispatch_offer_type text;

COMMENT ON COLUMN public.notifications.dispatch_offer_id
  IS 'Exact dispatch offer associated with this notification.';

COMMENT ON COLUMN public.notifications.dispatch_offer_type
  IS 'Dispatch offer source: marketplace or pasugo.';


-- Shared dispatch notification.
-- The dispatch offer itself is the source of truth for the exact
-- notification target. The dispatch job determines whether this is
-- Marketplace or Pasugo.
CREATE OR REPLACE FUNCTION public.notify_rider_new_dispatch_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dispatch_type text;
  store_name text;
  rider_title text;
  rider_body text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT
    j.dispatch_type,
    j.store_name
  INTO
    dispatch_type,
    store_name
  FROM public.dispatch_jobs j
  WHERE j.id = NEW.job_id;

  dispatch_type := COALESCE(dispatch_type, 'marketplace');

  IF dispatch_type = 'pasugo' THEN
    rider_title := 'New Pasugo booking';
    rider_body :=
      'A nearby customer needs errand help — PHP ' ||
      COALESCE(
        to_char(
          (
            SELECT j.delivery_fee
            FROM public.dispatch_jobs j
            WHERE j.id = NEW.job_id
          ),
          'FM999999990.00'
        ),
        '0.00'
      );
  ELSE
    rider_title := 'New delivery booking';
    rider_body :=
      'A delivery booking from ' ||
      COALESCE(store_name, 'a partner store') ||
      ' is waiting for your response.';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind,
    dispatch_offer_id,
    dispatch_offer_type
  )
  VALUES (
    NEW.rider_id,
    rider_title,
    rider_body,
    'dispatch',
    NEW.id,
    dispatch_type
  );

  RETURN NEW;
END;
$$;


-- Replace the marketplace broadcast function so it no longer
-- creates a second notification manually.
CREATE OR REPLACE FUNCTION public.dispatch_broadcast(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  s jsonb := public.dispatch_settings();
  timeout_s integer := COALESCE(
    (s->>'dispatch_timeout_seconds')::int,
    30
  );
  cap integer := COALESCE(
    (s->>'dispatch_max_riders_per_attempt')::int,
    5
  );
  sent integer := 0;
  r record;
BEGIN
  SELECT *
  INTO j
  FROM public.dispatch_jobs
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
      AND COALESCE(w.balance, 0) >=
        public.minimum_wallet_balance_for_role('rider')
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
        FROM public.dispatch_offers o
        WHERE o.job_id = j.id
          AND o.rider_id = rs.user_id
          AND o.status = 'declined'
      )
    ORDER BY
      dist NULLS LAST,
      rs.last_seen_at DESC
    LIMIT cap
  LOOP
    INSERT INTO public.dispatch_offers (
      job_id,
      order_id,
      rider_id,
      attempt,
      distance_km,
      expires_at
    )
    VALUES (
      j.id,
      j.order_id,
      r.user_id,
      j.attempt,
      r.dist,
      now() + make_interval(secs => timeout_s)
    )
    ON CONFLICT (job_id, rider_id, attempt)
    DO NOTHING;

    IF FOUND THEN
      sent := sent + 1;
    END IF;
  END LOOP;

  UPDATE public.dispatch_jobs
  SET
    expires_at = now() + make_interval(secs => timeout_s),
    last_attempt_at = now(),
    updated_at = now()
  WHERE id = j.id;

  RETURN sent;
END;
$function$;

REVOKE ALL
ON FUNCTION public.dispatch_broadcast(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.dispatch_broadcast(uuid)
TO authenticated, service_role;


-- Pasugo notification trigger.
CREATE OR REPLACE FUNCTION public.notify_rider_new_pasugo_dispatch_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind,
    dispatch_offer_id,
    dispatch_offer_type
  )
  VALUES (
    NEW.rider_id,
    'New Pasugo booking',
    'A nearby customer needs errand help — PHP ' ||
      to_char(
        (
          SELECT j.delivery_fee
          FROM public.pasugo_dispatch_jobs j
          WHERE j.id = NEW.job_id
        ),
        'FM999999990.00'
      ),
    'dispatch',
    NEW.id,
    'pasugo'
  );

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_notify_rider_new_pasugo_dispatch
ON public.pasugo_dispatch_offers;

CREATE TRIGGER trg_notify_rider_new_pasugo_dispatch
AFTER INSERT ON public.pasugo_dispatch_offers
FOR EACH ROW
EXECUTE FUNCTION public.notify_rider_new_pasugo_dispatch_offer();
