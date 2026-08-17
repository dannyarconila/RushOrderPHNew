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

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE booking_id = b.id;

  IF FOUND THEN
    UPDATE public.pasugo_dispatch_jobs
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_dispatch_offers
    SET status = CASE
        WHEN status = 'accepted' THEN status
        ELSE 'cancelled'
      END,
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
    WHERE job_id = j.id
      AND status IN ('pending', 'expired', 'declined', 'cancelled');
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.pasugo_cancel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_cancel(uuid) TO authenticated, service_role;