-- Keep the legacy retry RPC callable for jobs/cron that already use it, but
-- never let it send a new wave of offers. Pasugo customers choose the next
-- rider themselves after an expired request.
CREATE OR REPLACE FUNCTION public.pasugo_dispatch_retry(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  changed boolean := false;
BEGIN
  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN false; END IF;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id FOR UPDATE;
  IF NOT FOUND OR b.status NOT IN ('requested', 'finding_rider') THEN RETURN false; END IF;

  UPDATE public.pasugo_dispatch_offers
  SET status = 'expired', updated_at = now()
  WHERE job_id = j.id AND status = 'pending' AND expires_at <= now();
  changed := FOUND;

  IF changed THEN
    UPDATE public.pasugo_dispatch_jobs
    SET expires_at = NULL, updated_at = now()
    WHERE id = j.id;
    UPDATE public.pasugo_bookings
    SET status = 'finding_rider', updated_at = now()
    WHERE id = b.id;
  END IF;

  RETURN changed;
END;
$function$;
