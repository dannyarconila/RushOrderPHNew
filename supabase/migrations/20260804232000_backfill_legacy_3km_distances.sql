-- One-time backfill for legacy hardcoded 3km fallback distances.
--
-- Scope:
-- - Recompute `orders.distance_km` where it was saved as 3 from fallback logic.
-- - Recompute `dispatch_jobs.distance_km` where it was saved as 3 from fallback logic.
-- - Sync `deliveries.distance_km` from dispatch jobs when delivery rows still carry
--   fallback/empty values.
--
-- Safety:
-- - Uses only rows that currently equal the fallback value (3) or empty values for
--   deliveries.
-- - Uses available coordinates only.
-- - Does NOT modify delivery fees, totals, commissions, or payment records.

WITH order_recalc AS (
  SELECT
    o.id,
    round(public.haversine_km(st.latitude, st.longitude, ad.latitude, ad.longitude), 2) AS km
  FROM public.orders o
  JOIN public.stores st ON st.id = o.store_id
  JOIN public.addresses ad ON ad.id = o.address_id
  WHERE o.distance_km = 3
    AND st.latitude IS NOT NULL
    AND st.longitude IS NOT NULL
    AND ad.latitude IS NOT NULL
    AND ad.longitude IS NOT NULL
)
UPDATE public.orders o
SET distance_km = r.km,
    updated_at = now()
FROM order_recalc r
WHERE o.id = r.id
  AND r.km IS NOT NULL
  AND r.km >= 0
  AND r.km <> 3;

WITH job_recalc AS (
  SELECT
    j.id,
    round(public.haversine_km(j.pickup_lat, j.pickup_lng, j.dropoff_lat, j.dropoff_lng), 2) AS km
  FROM public.dispatch_jobs j
  WHERE j.distance_km = 3
    AND j.pickup_lat IS NOT NULL
    AND j.pickup_lng IS NOT NULL
    AND j.dropoff_lat IS NOT NULL
    AND j.dropoff_lng IS NOT NULL
)
UPDATE public.dispatch_jobs j
SET distance_km = r.km,
    updated_at = now()
FROM job_recalc r
WHERE j.id = r.id
  AND r.km IS NOT NULL
  AND r.km >= 0
  AND r.km <> 3;

UPDATE public.deliveries d
SET distance_km = j.distance_km,
    updated_at = now()
FROM public.dispatch_jobs j
WHERE d.order_id = j.order_id
  AND d.distance_km IN (0, 3)
  AND j.distance_km IS NOT NULL
  AND j.distance_km >= 0;
