-- Production workflow guards. These rules are database-enforced so they also
-- apply to direct PostgREST calls, not only the React application.

-- Applicants may amend submitted information while it is pending, but only an
-- administrator may decide an application or write review metadata.
CREATE OR REPLACE FUNCTION public.guard_application_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_portal_admin() OR public.has_role(auth.uid(), 'admin')
     OR current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'You are not authorized to modify this application.';
  END IF;
  IF OLD.status <> 'pending' OR NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending application details may be updated.';
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.status := OLD.status;
  NEW.review_notes := OLD.review_notes;
  NEW.reviewed_at := OLD.reviewed_at;
  NEW.device_fingerprint := OLD.device_fingerprint;
  NEW.ip_address := OLD.ip_address;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_application_review_guard ON public.seller_applications;
CREATE TRIGGER trg_seller_application_review_guard
BEFORE UPDATE ON public.seller_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_application_review_fields();

DROP TRIGGER IF EXISTS trg_rider_application_review_guard ON public.rider_applications;
CREATE TRIGGER trg_rider_application_review_guard
BEFORE UPDATE ON public.rider_applications
FOR EACH ROW EXECUTE FUNCTION public.guard_application_review_fields();

-- The order status machine is enforced independently of UI controls. Sellers
-- may advance preparation; customers may cancel only a pending order; assigned
-- riders may only complete their own dispatch.
CREATE OR REPLACE FUNCTION public.guard_order_workflow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  is_store_owner boolean := EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = OLD.store_id AND s.owner_id = uid
  );
  is_assigned_rider boolean := OLD.rider_id = uid AND EXISTS (
    SELECT 1 FROM public.dispatch_jobs j WHERE j.order_id = OLD.id AND j.assigned_rider_id = uid
  );
BEGIN
  IF public.is_portal_admin() OR public.has_role(uid, 'admin')
     OR current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF uid = OLD.customer_id THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'pending' AND NEW.status = 'cancelled') THEN
      RAISE EXCEPTION 'Customers may only cancel pending orders.';
    END IF;
    NEW.rider_id := OLD.rider_id;
    RETURN NEW;
  END IF;

  IF is_store_owner THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT ((OLD.status = 'pending' AND NEW.status = 'confirmed')
             OR (OLD.status = 'confirmed' AND NEW.status = 'preparing')
             OR (OLD.status = 'preparing' AND NEW.status = 'ready')) THEN
      RAISE EXCEPTION 'Invalid seller order transition.';
    END IF;
    NEW.rider_id := OLD.rider_id;
    RETURN NEW;
  END IF;

  -- dispatch_accept sets rider_id while the order remains ready.
  IF OLD.rider_id IS NULL AND NEW.rider_id = uid
     AND NEW.status = OLD.status
     AND EXISTS (
       SELECT 1 FROM public.dispatch_jobs j
       WHERE j.order_id = OLD.id AND j.assigned_rider_id = uid AND j.status = 'assigned'
     ) THEN
    RETURN NEW;
  END IF;

  IF is_assigned_rider
     AND ((OLD.status = 'ready' AND NEW.status = 'picked_up')
       OR (OLD.status = 'picked_up' AND NEW.status = 'delivered')) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'You are not authorized to change this order.';
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_workflow_guard ON public.orders;
CREATE TRIGGER trg_orders_workflow_guard
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_workflow();

-- A retry worker can call this function on an interval. It is intentionally
-- bounded and idempotent: only expired searching jobs are retried.
CREATE OR REPLACE FUNCTION public.retry_expired_dispatches(_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  job_id uuid;
  processed integer := 0;
BEGIN
  IF NOT public.is_portal_admin() AND current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Administrator or service role required.';
  END IF;

  FOR job_id IN
    SELECT id FROM public.dispatch_jobs
    WHERE status = 'searching' AND expires_at IS NOT NULL AND expires_at <= now()
    ORDER BY expires_at
    LIMIT LEAST(GREATEST(COALESCE(_limit, 100), 1), 500)
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.dispatch_retry(job_id);
    processed := processed + 1;
  END LOOP;
  RETURN processed;
END;
$$;
REVOKE ALL ON FUNCTION public.retry_expired_dispatches(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_expired_dispatches(integer) TO service_role;

-- Disable the historic repository-seeded factory account. Accounts whose
-- setup has already been completed are unaffected.
UPDATE public.admin_accounts
SET is_active = false, locked_until = now(), updated_at = now()
WHERE is_default_credentials = true;

-- Keep the query-cache invalidation channel complete for settings, wallet, and
-- marketplace changes. Duplicate-object protection makes this safe on both
-- new and already provisioned projects.
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.stores; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.products; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.orders; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wallets; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.wallet_topups; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_methods; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.system_settings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
