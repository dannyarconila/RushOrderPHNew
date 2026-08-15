-- ============================================================
-- Pasugo customer-selected rider expiry
--
-- In the customer-selected flow, a timed-out rider must NOT
-- trigger automatic broadcasting or radius expansion.
--
-- The customer simply gets the available-rider list again.
-- The timed-out rider remains excluded for this booking only.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pasugo_available_riders(_job_id uuid)
RETURNS TABLE(
  rider_id uuid,
  rider_name text,
  distance_km numeric,
  latitude numeric,
  longitude numeric,
  last_seen_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  required_balance numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pasugo dispatch job not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR SHARE;

  IF NOT FOUND OR b.customer_id <> uid THEN
    RAISE EXCEPTION 'You are not authorized to view riders for this booking.';
  END IF;

  IF j.status <> 'searching'
     OR b.status NOT IN ('requested', 'finding_rider')
  THEN
    RETURN;
  END IF;

  required_balance := public.minimum_wallet_balance_for_role('rider');

  RETURN QUERY
  SELECT
    rs.user_id AS rider_id,

    COALESCE(
      NULLIF(to_jsonb(p)->>'full_name', ''),
      NULLIF(to_jsonb(p)->>'display_name', ''),
      NULLIF(
        concat_ws(
          ' ',
          NULLIF(to_jsonb(p)->>'first_name', ''),
          NULLIF(to_jsonb(p)->>'last_name', '')
        ),
        ''
      ),
      'RushOrder Rider'
    ) AS rider_name,

    ROUND(
      public.haversine_km(
        rs.latitude,
        rs.longitude,
        j.pickup_lat,
        j.pickup_lng
      ),
      2
    ) AS distance_km,

    rs.latitude,
    rs.longitude,
    rs.last_seen_at

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

  WHERE rs.is_online = true
    AND rs.is_available = true
    AND rs.latitude IS NOT NULL
    AND rs.longitude IS NOT NULL
    AND p.account_status = 'active'
    AND COALESCE(w.balance, 0) >= required_balance

    -- A rider who rejected OR timed out on this booking
    -- must not be offered the same booking again.
    AND NOT EXISTS (
      SELECT 1
      FROM public.pasugo_dispatch_offers o
      WHERE o.job_id = j.id
        AND o.rider_id = rs.user_id
        AND o.status IN ('declined', 'expired')
    )

    -- Do not show the currently selected rider while
    -- their request is still pending.
    AND NOT EXISTS (
      SELECT 1
      FROM public.pasugo_dispatch_offers o
      WHERE o.job_id = j.id
        AND o.rider_id = rs.user_id
        AND o.status = 'pending'
        AND o.expires_at > now()
    )

  ORDER BY
    public.haversine_km(
      rs.latitude,
      rs.longitude,
      j.pickup_lat,
      j.pickup_lng
    ) ASC,
    rs.last_seen_at DESC;
END;
$$;


-- ============================================================
-- Expire the currently selected rider request.
--
-- Customer-only operation.
--
-- IMPORTANT:
-- This deliberately does NOT:
--   * broadcast to all riders
--   * expand the dispatch radius
--   * increment the dispatch attempt
--   * change rider availability
--
-- It only expires the timed-out offer and returns the booking
-- to manual rider selection.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pasugo_expire_selected_rider(
  _job_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  changed boolean := false;
  affected_rows integer := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pasugo dispatch job not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR UPDATE;

  IF NOT FOUND OR b.customer_id <> uid THEN
    RAISE EXCEPTION 'You are not authorized to expire this rider request.';
  END IF;

  IF j.status <> 'searching'
     OR b.status NOT IN ('requested', 'finding_rider')
  THEN
    RETURN false;
  END IF;

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'expired',
    updated_at = now()
  WHERE job_id = j.id
    AND status = 'pending'
    AND expires_at <= now();

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  changed := affected_rows > 0;

  IF changed THEN
    UPDATE public.pasugo_dispatch_jobs
    SET
      expires_at = NULL,
      updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET
      status = 'finding_rider',
      updated_at = now()
    WHERE id = b.id;
  END IF;

  RETURN changed;
END;
$$;


REVOKE ALL
ON FUNCTION public.pasugo_expire_selected_rider(uuid)
FROM PUBLIC, anon;

GRANT EXECUTE
ON FUNCTION public.pasugo_expire_selected_rider(uuid)
TO authenticated, service_role;
