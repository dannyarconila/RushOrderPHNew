-- Stop marketplace rider dispatch immediately when an order is cancelled.
--
-- This protects the dispatch worker from continuing to retry/broadcast
-- a booking after the store/customer has cancelled the order.

CREATE OR REPLACE FUNCTION public.stop_dispatch_on_order_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM NEW.status
  THEN
    -- Stop the active marketplace dispatch job.
    UPDATE public.dispatch_jobs
    SET
      status = 'cancelled',
      updated_at = now(),
      expires_at = now()
    WHERE order_id = NEW.id
      AND status = 'searching';

    -- Prevent any still-pending rider offers from remaining actionable.
    UPDATE public.dispatch_offers
    SET
      status = 'expired',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now(),
      expires_at = LEAST(COALESCE(expires_at, now()), now())
    WHERE order_id = NEW.id
      AND status = 'pending';

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stop_dispatch_on_order_cancellation
ON public.orders;

CREATE TRIGGER trg_stop_dispatch_on_order_cancellation
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (NEW.status = 'cancelled')
EXECUTE FUNCTION public.stop_dispatch_on_order_cancellation();

COMMENT ON FUNCTION public.stop_dispatch_on_order_cancellation()
IS 'Cancels active marketplace dispatch jobs and expires pending rider offers when an order is cancelled.';
