CREATE OR REPLACE FUNCTION public.release_rider_after_pasugo_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rider_id uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     OR NEW.status <> 'cancelled' THEN
    RETURN NEW;
  END IF;

  rider_id := NEW.assigned_rider_id;

  UPDATE public.pasugo_dispatch_jobs
  SET
    status = 'cancelled',
    updated_at = now()
  WHERE booking_id = NEW.id
    AND status NOT IN ('delivered', 'cancelled');

  UPDATE public.pasugo_dispatch_offers
  SET
    status = 'cancelled'::dispatch_offer_status,
    responded_at = COALESCE(responded_at, now()),
    updated_at = now()
  WHERE booking_id = NEW.id
    AND status IN ('pending', 'accepted');

  IF rider_id IS NOT NULL THEN
    PERFORM public.refresh_rider_availability(rider_id);
  END IF;

  RETURN NEW;
END;
$function$;
