CREATE OR REPLACE FUNCTION public.pasugo_cancel(_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  b public.pasugo_bookings%ROWTYPE;
  j public.pasugo_dispatch_jobs%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = _booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF b.customer_id <> uid
     AND NOT public.has_role(uid, 'admin') THEN
    RAISE EXCEPTION 'You are not authorized to cancel this booking.';
  END IF;

  IF b.status IN ('delivered', 'completed', 'cancelled') THEN
    RETURN false;
  END IF;

  /*
   * Cancel the booking first so any subsequent retry/broadcast/accept
   * operation sees the terminal cancelled state.
   */
  UPDATE public.pasugo_bookings
  SET
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  WHERE id = b.id;

  /*
   * Cancel the dispatch job and every offer belonging to it.
   * This intentionally includes an already accepted offer.
   */
  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE booking_id = b.id
  FOR UPDATE;

  IF FOUND THEN
    UPDATE public.pasugo_dispatch_jobs
    SET
      status = 'cancelled',
      expires_at = NULL,
      updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_dispatch_offers
    SET
      status = 'cancelled',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE job_id = j.id
      AND status <> 'cancelled';
  END IF;

  RETURN true;
END;
$function$;
