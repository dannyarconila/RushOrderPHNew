-- ============================================================
-- Make dispatch_retry_interval_seconds effective.
--
-- dispatch_timeout_seconds:
--   Rider response/offer timeout.
--
-- dispatch_retry_interval_seconds:
--   Additional waiting period after the current rider-offer
--   window expires before the next dispatch retry becomes eligible.
--
-- The existing 1-minute retry worker remains unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_retry(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  next_radius numeric;
  retry_interval_seconds integer;
BEGIN
  SELECT *
  INTO j
  FROM public.dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND OR j.status <> 'searching' THEN
    RETURN false;
  END IF;

  -- The current rider offers must have expired first.
  IF j.expires_at IS NOT NULL AND j.expires_at > now() THEN
    RETURN false;
  END IF;

  -- Wait for the Admin-configured retry interval AFTER
-- the current rider-offer window has expired.
retry_interval_seconds := GREATEST(
  COALESCE(
    (s->>'dispatch_retry_interval_seconds')::integer,
    15
  ),
  0
);

IF j.expires_at IS NOT NULL
   AND j.expires_at
     + make_interval(secs => retry_interval_seconds)
     > now() THEN
  RETURN false;
END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.is_portal_admin()
    OR public.has_role(uid, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.stores st
      JOIN public.orders o ON o.store_id = st.id
      WHERE st.id = j.store_id
        AND st.owner_id = uid
        AND o.id = j.order_id
        AND o.status = 'ready'
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to retry this dispatch job.';
  END IF;

  UPDATE public.dispatch_offers
  SET
    status = 'expired',
    updated_at = now()
  WHERE job_id = j.id
    AND status = 'pending'
    AND expires_at <= now();

  IF j.attempt >= COALESCE(j.max_attempts, 5) THEN
    UPDATE public.dispatch_jobs
    SET
      status = 'failed',
      updated_at = now()
    WHERE id = j.id;

    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      kind
    )
    SELECT
      st.owner_id,
      'No rider available',
      'We could not find a rider for order '
        || COALESCE(o.claim_number, left(o.id::text, 8))
        || '.',
      'dispatch'
    FROM public.orders o
    JOIN public.stores st ON st.id = o.store_id
    WHERE o.id = j.order_id;

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

  UPDATE public.dispatch_jobs
  SET
    attempt = j.attempt + 1,
    radius_km = next_radius,
    updated_at = now()
  WHERE id = j.id;

  PERFORM public.dispatch_broadcast(j.id);

  RETURN true;
END;
$$;

REVOKE ALL
ON FUNCTION public.dispatch_retry(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.dispatch_retry(uuid)
TO authenticated, service_role;