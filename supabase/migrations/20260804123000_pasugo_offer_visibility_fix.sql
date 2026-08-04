-- Fix Pasugo rider popup visibility.
-- Riders must be able to read Pasugo booking/job rows for offers sent to them,
-- even before the job is assigned.

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

DROP POLICY IF EXISTS pasugo_bookings_read ON public.pasugo_bookings;
CREATE POLICY pasugo_bookings_read ON public.pasugo_bookings
FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR assigned_rider_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers o
    JOIN public.pasugo_dispatch_jobs j ON j.id = o.job_id
    WHERE j.booking_id = pasugo_bookings.id
      AND o.rider_id = auth.uid()
  )
  OR public.has_role(auth.uid(), 'admin')
);
