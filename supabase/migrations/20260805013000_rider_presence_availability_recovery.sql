-- Recover riders stuck as unavailable and harden presence updates.
-- This helps dispatch_offers delivery for riders who are online but were left
-- with is_available = false by legacy/aborted flows.

CREATE OR REPLACE FUNCTION public.rider_set_presence(_online boolean, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
  has_active_dispatch boolean := false;
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

    SELECT EXISTS (
      SELECT 1
      FROM public.dispatch_jobs j
      WHERE j.assigned_rider_id = uid
        AND j.status IN ('assigned', 'picked_up')
    ) INTO has_active_dispatch;
  END IF;

  INSERT INTO public.rider_status (user_id, is_online, is_available, latitude, longitude, last_seen_at)
  VALUES (
    uid,
    _online,
    CASE WHEN _online THEN NOT has_active_dispatch ELSE false END,
    _lat,
    _lng,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
    SET is_online = EXCLUDED.is_online,
        is_available = CASE
          WHEN EXCLUDED.is_online = false THEN false
          WHEN has_active_dispatch THEN public.rider_status.is_available
          ELSE true
        END,
        latitude = COALESCE(EXCLUDED.latitude, public.rider_status.latitude),
        longitude = COALESCE(EXCLUDED.longitude, public.rider_status.longitude),
        last_seen_at = now(),
        updated_at = now();

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.rider_set_presence(boolean, numeric, numeric) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rider_set_presence(boolean, numeric, numeric) TO authenticated, service_role;

-- One-time recovery for currently-online riders with no active dispatch.
UPDATE public.rider_status rs
SET is_available = true,
    updated_at = now()
WHERE rs.is_online = true
  AND rs.is_available = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.dispatch_jobs j
    WHERE j.assigned_rider_id = rs.user_id
      AND j.status IN ('assigned', 'picked_up')
  );
