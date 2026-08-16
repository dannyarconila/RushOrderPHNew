-- Seller-controlled marketplace visibility.
-- This is intentionally separate from is_active/is_online so hiding a
-- storefront does not interfere with wallet enforcement or availability.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.stores.is_visible IS
  'Whether the seller wants the store displayed in marketplace discovery.';

CREATE OR REPLACE FUNCTION public.get_marketplace_stores(
  _customer_lat numeric DEFAULT NULL::numeric,
  _customer_lng numeric DEFAULT NULL::numeric,
  _service_type text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  description text,
  logo_url text,
  banner_url text,
  service_type text,
  category_id uuid,
  is_online boolean,
  is_featured boolean,
  business_hours jsonb,
  delivery_fee_override numeric,
  prep_time_minutes integer,
  minimum_order numeric,
  rating numeric,
  rating_count integer,
  address jsonb,
  latitude numeric,
  longitude numeric,
  distance_km numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH settings AS (
    SELECT GREATEST(
      COALESCE(
        (
          SELECT value::numeric
          FROM public.system_settings
          WHERE key = 'marketplace_customer_radius_km'
          LIMIT 1
        ),
        15
      ),
      0
    ) AS radius_km
  )
  SELECT
    s.id,
    s.name,
    s.slug,
    s.description,
    s.logo_url,
    s.banner_url,
    s.service_type,
    s.category_id,
    s.is_online,
    s.is_featured,
    s.business_hours,
    s.delivery_fee_override,
    s.prep_time_minutes,
    s.minimum_order,
    s.rating,
    s.rating_count,
    s.address,
    s.latitude,
    s.longitude,
    CASE
      WHEN _customer_lat IS NULL
        OR _customer_lng IS NULL
        OR s.latitude IS NULL
        OR s.longitude IS NULL
      THEN NULL
      ELSE public.haversine_km(
        _customer_lat,
        _customer_lng,
        s.latitude,
        s.longitude
      )
    END AS distance_km
  FROM public.stores s
  CROSS JOIN settings
  WHERE s.is_active = true
    AND s.is_visible = true
    AND s.is_approved = true
    AND s.verification_status = 'verified'
    AND s.deleted_at IS NULL
    AND (
      _service_type IS NULL
      OR s.service_type = _service_type
    )
    AND (
      _customer_lat IS NULL
      OR _customer_lng IS NULL
      OR s.latitude IS NULL
      OR s.longitude IS NULL
      OR public.haversine_km(
        _customer_lat,
        _customer_lng,
        s.latitude,
        s.longitude
      ) <= settings.radius_km
    )
  ORDER BY
    s.is_featured DESC,
    CASE
      WHEN _customer_lat IS NULL OR _customer_lng IS NULL
      THEN NULL
      ELSE public.haversine_km(
        _customer_lat,
        _customer_lng,
        s.latitude,
        s.longitude
      )
    END ASC NULLS LAST,
    s.rating DESC
  LIMIT 60;
$function$;