-- 1. Fix mutable search_path on all public functions missing it
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND (p.proconfig IS NULL OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- 2. Revoke EXECUTE from anon/public on every SECURITY DEFINER function in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- 3. Scope rider_status reads
DROP POLICY IF EXISTS rider_status_read_authenticated ON public.rider_status;

CREATE POLICY rider_status_read_scoped ON public.rider_status
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.orders o
     LEFT JOIN public.stores s ON s.id = o.store_id
    WHERE o.rider_id = rider_status.user_id
      AND o.status IN ('ready', 'picked_up')
      AND (o.customer_id = auth.uid() OR s.owner_id = auth.uid())
  )
);
