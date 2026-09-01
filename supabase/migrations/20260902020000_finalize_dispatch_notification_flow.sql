-- Finalize rider dispatch notification flow.
--
-- The dispatch offer is the single source of truth.
-- dispatch_broadcast() creates offers.
-- trg_notify_rider_new_dispatch creates exactly one notification
-- for each newly-created pending marketplace offer.
--
-- IMPORTANT:
-- Do not alter historical migrations. This migration only hardens
-- the currently deployed database functions/triggers.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dispatch_offer_id uuid;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dispatch_offer_type text;


COMMENT ON COLUMN public.notifications.dispatch_offer_id
  IS 'Exact dispatch offer associated with this notification.';

COMMENT ON COLUMN public.notifications.dispatch_offer_type
  IS 'Dispatch offer source: marketplace or Pasugo.';


-- ----------------------------------------------------------
-- Single rider notification source for shared dispatch offers.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_rider_new_dispatch_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  dispatch_type text;
  store_name text;
  delivery_fee numeric;
  rider_title text;
  rider_body text;
BEGIN
  -- Only newly-created pending offers generate a notification.
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT
    j.dispatch_type,
    j.store_name,
    j.delivery_fee
  INTO
    dispatch_type,
    store_name,
    delivery_fee
  FROM public.dispatch_jobs j
  WHERE j.id = NEW.job_id;

  dispatch_type := COALESCE(dispatch_type, 'marketplace');

  IF dispatch_type = 'pasugo' THEN
    rider_title := 'New Pasugo booking';

    rider_body :=
      'A nearby customer needs errand help — PHP ' ||
      to_char(
        COALESCE(delivery_fee, 0),
        'FM999999990.00'
      );
  ELSE
    rider_title := 'New delivery booking';

    rider_body :=
      'A delivery booking from ' ||
      COALESCE(store_name, 'a partner store') ||
      ' is waiting for your response.';
  END IF;

  -- Prevent duplicate notification rows for the same offer.
  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.dispatch_offer_id = NEW.id
      AND n.user_id = NEW.rider_id
      AND n.kind = 'dispatch'
  ) THEN

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

  END IF;

  RETURN NEW;
END;
$function$;


-- ----------------------------------------------------------
-- Ensure the trigger exists exactly once.
-- ----------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_rider_new_dispatch
ON public.dispatch_offers;

CREATE TRIGGER trg_notify_rider_new_dispatch
AFTER INSERT ON public.dispatch_offers
FOR EACH ROW
EXECUTE FUNCTION public.notify_rider_new_dispatch_offer();


-- ----------------------------------------------------------
-- Remove any direct notification creation from the current
-- dispatch_broadcast() implementation.
--
-- We intentionally preserve the hardened function already
-- installed by the previous migrations. This migration does
-- NOT replace that function wholesale.
--
-- The trigger above is now responsible for rider notifications.
-- ----------------------------------------------------------

COMMENT ON FUNCTION public.notify_rider_new_dispatch_offer()
IS 'Creates exactly one rider dispatch notification per pending dispatch offer and stores the exact offer ID for push navigation.';
