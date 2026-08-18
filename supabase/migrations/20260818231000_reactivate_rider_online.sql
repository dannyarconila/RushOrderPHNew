-- Reactivating a rider also restores their online state.
-- The rider may still manually toggle Offline afterward.
CREATE OR REPLACE FUNCTION public.admin_portal_set_account_status(
  _user_id uuid,
  _status public.account_status,
  _note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status public.account_status;
  rider_exists boolean;
  clean_note text;
BEGIN
  IF NOT public.is_portal_admin()
     AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Only administrators can change account status.';
  END IF;

  -- Allow this privileged admin RPC to pass the profile status guard.
  PERFORM set_config('app.portal_admin', 'on', true);

  clean_note := NULLIF(btrim(_note), '');

  SELECT account_status
  INTO old_status
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User account not found.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'rider'
  )
  INTO rider_exists;

  UPDATE public.profiles
  SET
    account_status = _status,
    status_note = clean_note
  WHERE id = _user_id;

  IF rider_exists AND _status IN ('banned', 'suspended') THEN

    -- Restricted riders are always forced offline.
    UPDATE public.rider_status
    SET
      is_online = false,
      is_available = false,
      updated_at = now()
    WHERE user_id = _user_id;

    -- Cancel marketplace offers that have not been accepted.
    UPDATE public.dispatch_offers
    SET
      status = 'cancelled',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE rider_id = _user_id
      AND status = 'pending';

    -- Cancel Pasugo offers that have not been accepted.
    UPDATE public.pasugo_dispatch_offers
    SET
      status = 'cancelled',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE rider_id = _user_id
      AND status = 'pending';

  ELSIF rider_exists
        AND _status = 'active'
        AND old_status IS DISTINCT FROM 'active' THEN

    -- Reactivation restores the rider to Online.
    -- Availability is calculated separately so an existing active
    -- assignment can never be replaced by a new booking.
    UPDATE public.rider_status
    SET
      is_online = true,
      updated_at = now()
    WHERE user_id = _user_id;

    PERFORM public.refresh_rider_availability(_user_id);
  END IF;

  IF old_status IS DISTINCT FROM _status THEN
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      kind
    )
    VALUES (
      _user_id,
      CASE
        WHEN _status = 'banned' THEN 'Rider account banned'
        WHEN _status = 'suspended' THEN 'Rider account suspended'
        WHEN _status = 'active' THEN 'Rider account reactivated'
        ELSE 'Account status updated'
      END,
      CASE
        WHEN _status = 'banned'
          THEN 'Your rider account has been banned.'
            || COALESCE(' Reason: ' || clean_note, '')
        WHEN _status = 'suspended'
          THEN 'Your rider account has been suspended.'
            || COALESCE(' Reason: ' || clean_note, '')
        WHEN _status = 'active'
          THEN 'Your rider account has been reactivated. You are now online and can receive bookings.'
        ELSE
          'Your account status has been changed to '
          || _status::text
          || COALESCE('. Note: ' || clean_note, '.')
      END,
      'account'
    );
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL
ON FUNCTION public.admin_portal_set_account_status(
  uuid,
  public.account_status,
  text
)
FROM public, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.admin_portal_set_account_status(
  uuid,
  public.account_status,
  text
)
TO service_role;
