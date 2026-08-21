-- Create notification-center entries when marketplace orders and rider
-- dispatch offers are created. The existing notifications_push_trigger
-- then forwards these entries to the send-push Edge Function.

CREATE OR REPLACE FUNCTION public.notify_seller_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_id uuid;
  store_name text;
BEGIN
  IF NEW.status <> 'pending' OR NEW.store_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.owner_id, s.name
  INTO seller_id, store_name
  FROM public.stores s
  WHERE s.id = NEW.store_id;

  IF seller_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    seller_id,
    'New incoming order',
    'A new order has arrived at ' ||
      COALESCE(store_name, 'your store') ||
      '. Open your Orders page to review and accept it.',
    'order'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_seller_new_order
ON public.orders;

CREATE TRIGGER trg_notify_seller_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.notify_seller_new_order();


CREATE OR REPLACE FUNCTION public.notify_rider_new_dispatch_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  store_name text;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT j.store_name
  INTO store_name
  FROM public.dispatch_jobs j
  WHERE j.id = NEW.job_id;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    NEW.rider_id,
    'New delivery booking',
    'A delivery booking from ' ||
      COALESCE(store_name, 'a partner store') ||
      ' is waiting for your response.',
    'dispatch'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_rider_new_dispatch
ON public.dispatch_offers;

CREATE TRIGGER trg_notify_rider_new_dispatch
AFTER INSERT ON public.dispatch_offers
FOR EACH ROW
EXECUTE FUNCTION public.notify_rider_new_dispatch_offer();
