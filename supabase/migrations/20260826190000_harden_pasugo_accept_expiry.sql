-- Harden Pasugo rider acceptance:
-- An offer may only be accepted while its pending offer window is still valid.
-- The database must enforce this independently of the rider UI.

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
  rider_account_status public.account_status;
  offer_expires_at timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can accept bookings.';
  END IF;

  SELECT account_status
  INTO rider_account_status
  FROM public.profiles
  WHERE id = uid;

  IF rider_account_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason',
      CASE rider_account_status
        WHEN 'banned' THEN 'banned'
        WHEN 'suspended' THEN 'suspended'
        ELSE 'inactive'
      END
    );
  END IF;

  required_balance := public.minimum_wallet_balance_for_role('rider');

  SELECT balance
  INTO current_balance
  FROM public.wallets
  WHERE user_id = uid
    AND wallet_type = 'rider'
    AND deleted_at IS NULL
  LIMIT 1;

  IF current_balance IS NULL OR current_balance < required_balance THEN
    RAISE EXCEPTION
      'Your rider wallet balance must be at least ₱% to accept bookings.',
      required_balance;
  END IF;

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR b.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unavailable'
    );
  END IF;

  /*
   * Lock and validate this rider's offer.
   * Expired pending offers must never be accepted even if the
   * client somehow calls the RPC after the popup has disappeared.
   */
  SELECT expires_at
  INTO offer_expires_at
  FROM public.pasugo_dispatch_offers
  WHERE job_id = j.id
    AND rider_id = uid
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF offer_expires_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unavailable'
    );
  END IF;

  IF offer_expires_at <= now() THEN
    UPDATE public.pasugo_dispatch_offers
    SET
      status = 'expired',
      responded_at = now(),
      updated_at = now()
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
      AND expires_at <= now();

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'expired'
    );
  END IF;

  IF j.status <> 'searching'
     OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'taken'
    );
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET
    status = 'assigned',
    assigned_rider_id = uid,
    assigned_at = now(),
    expires_at = NULL,
    updated_at = now()
  WHERE id = j.id;

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'accepted',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id = uid
    AND status = 'pending';

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'cancelled',
    responded_at = now(),
    updated_at = now()
  WHERE job_id = j.id
    AND rider_id <> uid
    AND status = 'pending';

  UPDATE public.rider_status
  SET
    is_available = false,
    updated_at = now()
  WHERE user_id = uid;

  UPDATE public.pasugo_bookings
  SET
    assigned_rider_id = uid,
    status = 'accepted',
    updated_at = now()
  WHERE id = j.booking_id;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    b.customer_id,
    'Rider assigned',
    'A rider accepted your Pasugo booking.',
    'dispatch'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', j.booking_id
  );
END;
$function$;
