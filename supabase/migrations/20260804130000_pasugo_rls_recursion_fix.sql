-- Fix infinite recursion in Pasugo RLS policies.
-- Root cause: pasugo_bookings policy joined pasugo_dispatch_jobs,
-- while pasugo_dispatch_jobs policy queried pasugo_bookings.
-- This created a policy evaluation loop.

DROP POLICY IF EXISTS pasugo_bookings_read ON public.pasugo_bookings;
CREATE POLICY pasugo_bookings_read ON public.pasugo_bookings
FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR assigned_rider_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers o
    WHERE o.booking_id = pasugo_bookings.id
      AND o.rider_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS pasugo_dispatch_jobs_read ON public.pasugo_dispatch_jobs;
CREATE POLICY pasugo_dispatch_jobs_read ON public.pasugo_dispatch_jobs
FOR SELECT TO authenticated
USING (
  assigned_rider_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers o
    WHERE o.job_id = pasugo_dispatch_jobs.id
      AND o.rider_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.pasugo_bookings b
    WHERE b.id = pasugo_dispatch_jobs.booking_id
      AND b.customer_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);
