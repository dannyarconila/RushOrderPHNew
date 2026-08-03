-- Ensure approval automation and storage provisioning stay connected across
-- customer, seller, rider and admin workflows.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_application_approval'
  ) THEN
    RAISE EXCEPTION 'Missing required function public.handle_application_approval()';
  END IF;
END;
$$;

-- Re-attach approval triggers. Some projects dropped these in an earlier migration.
DROP TRIGGER IF EXISTS trg_seller_application_approval ON public.seller_applications;
CREATE TRIGGER trg_seller_application_approval
BEFORE UPDATE ON public.seller_applications
FOR EACH ROW EXECUTE FUNCTION public.handle_application_approval();

DROP TRIGGER IF EXISTS trg_rider_application_approval ON public.rider_applications;
CREATE TRIGGER trg_rider_application_approval
BEFORE UPDATE ON public.rider_applications
FOR EACH ROW EXECUTE FUNCTION public.handle_application_approval();

-- Backfill roles and wallets for already-approved applications.
WITH approved_sellers AS (
  SELECT DISTINCT ON (a.user_id)
    a.user_id,
    a.business_info,
    a.store_info,
    a.address,
    a.created_at
  FROM public.seller_applications a
  WHERE a.status = 'approved'
  ORDER BY a.user_id, a.reviewed_at DESC NULLS LAST, a.created_at DESC
),
approved_riders AS (
  SELECT DISTINCT ON (a.user_id)
    a.user_id,
    a.vehicle_info
  FROM public.rider_applications a
  WHERE a.status = 'approved'
  ORDER BY a.user_id, a.reviewed_at DESC NULLS LAST, a.created_at DESC
)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'seller'::public.app_role FROM approved_sellers
ON CONFLICT (user_id, role) DO NOTHING;

WITH approved_riders AS (
  SELECT DISTINCT ON (a.user_id)
    a.user_id
  FROM public.rider_applications a
  WHERE a.status = 'approved'
  ORDER BY a.user_id, a.reviewed_at DESC NULLS LAST, a.created_at DESC
)
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'rider'::public.app_role FROM approved_riders
ON CONFLICT (user_id, role) DO NOTHING;

WITH approved_wallets AS (
  SELECT DISTINCT user_id, 'seller'::public.wallet_type AS wallet_type
  FROM public.seller_applications
  WHERE status = 'approved'
  UNION
  SELECT DISTINCT user_id, 'rider'::public.wallet_type AS wallet_type
  FROM public.rider_applications
  WHERE status = 'approved'
)
INSERT INTO public.wallets (user_id, wallet_type)
SELECT user_id, wallet_type FROM approved_wallets
ON CONFLICT (user_id, wallet_type) DO NOTHING;

UPDATE public.wallets w
SET is_active = true,
    deleted_at = NULL,
    updated_at = now()
WHERE EXISTS (
  SELECT 1
  FROM public.seller_applications s
  WHERE s.user_id = w.user_id AND s.status = 'approved' AND w.wallet_type = 'seller'
)
OR EXISTS (
  SELECT 1
  FROM public.rider_applications r
  WHERE r.user_id = w.user_id AND r.status = 'approved' AND w.wallet_type = 'rider'
);

-- Backfill missing storefront rows for approved sellers.
WITH approved_sellers AS (
  SELECT DISTINCT ON (a.user_id)
    a.user_id,
    a.business_info,
    a.store_info,
    a.address,
    a.created_at
  FROM public.seller_applications a
  WHERE a.status = 'approved'
  ORDER BY a.user_id, a.reviewed_at DESC NULLS LAST, a.created_at DESC
)
INSERT INTO public.stores (
  owner_id,
  name,
  description,
  address,
  service_type,
  is_approved,
  is_active,
  is_online,
  wallet_hold,
  verification_status,
  verification_notes,
  verified_at,
  created_at,
  updated_at
)
SELECT
  s.user_id,
  COALESCE(
    NULLIF(s.store_info ->> 'store_name', ''),
    NULLIF(s.business_info ->> 'business_name', ''),
    'RushOrder Store'
  ),
  NULLIF(s.store_info ->> 'description', ''),
  jsonb_build_object(
    'line1', COALESCE(NULLIF(s.address ->> 'line1', ''), NULLIF(s.address ->> 'street', ''), ''),
    'barangay', COALESCE(s.address ->> 'barangay', ''),
    'city', COALESCE(s.address ->> 'city', ''),
    'province', COALESCE(s.address ->> 'province', ''),
    'postal_code', COALESCE(s.address ->> 'postal_code', '')
  ),
  CASE
    WHEN COALESCE(NULLIF(lower(s.store_info ->> 'service_type'), ''), '') IN ('food', 'groceries', 'pharmacy', 'services')
      THEN lower(s.store_info ->> 'service_type')
    WHEN lower(COALESCE(s.store_info ->> 'category', '')) LIKE '%grocer%'
      THEN 'groceries'
    WHEN lower(COALESCE(s.store_info ->> 'category', '')) LIKE '%health%'
      OR lower(COALESCE(s.store_info ->> 'category', '')) LIKE '%pharmacy%'
      OR lower(COALESCE(s.store_info ->> 'category', '')) LIKE '%beauty%'
      THEN 'pharmacy'
    WHEN lower(COALESCE(s.store_info ->> 'category', '')) LIKE '%food%'
      OR lower(COALESCE(s.store_info ->> 'category', '')) LIKE '%beverage%'
      THEN 'food'
    ELSE 'services'
  END,
  true,
  true,
  true,
  false,
  'verified'::public.store_verification_status,
  NULL,
  now(),
  s.created_at,
  now()
FROM approved_sellers s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stores st
  WHERE st.owner_id = s.user_id AND st.deleted_at IS NULL
);

-- For existing stores owned by approved sellers, enforce active verified state.
UPDATE public.stores st
SET is_approved = true,
    is_active = true,
    wallet_hold = false,
    verification_status = 'verified'::public.store_verification_status,
    verification_notes = NULL,
    verified_at = COALESCE(st.verified_at, now()),
    updated_at = now()
WHERE st.deleted_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.seller_applications sa
    WHERE sa.user_id = st.owner_id AND sa.status = 'approved'
  );

-- Ensure rider presence row exists after approval.
WITH approved_riders AS (
  SELECT DISTINCT ON (a.user_id)
    a.user_id,
    a.vehicle_info
  FROM public.rider_applications a
  WHERE a.status = 'approved'
  ORDER BY a.user_id, a.reviewed_at DESC NULLS LAST, a.created_at DESC
)
INSERT INTO public.rider_status (user_id, is_online, is_available, vehicle_type, plate_number, last_seen_at)
SELECT
  r.user_id,
  false,
  true,
  NULLIF(r.vehicle_info ->> 'vehicle_type', ''),
  NULLIF(r.vehicle_info ->> 'plate_number', ''),
  now()
FROM approved_riders r
ON CONFLICT (user_id) DO NOTHING;

-- Create required storage buckets if missing.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('verification-documents', 'verification-documents', false),
  ('store-logos', 'store-logos', false),
  ('store-banners', 'store-banners', false),
  ('product-images', 'product-images', false),
  ('customer-avatars', 'customer-avatars', false),
  ('chat-images', 'chat-images', false),
  ('payment-proofs', 'payment-proofs', false),
  ('payment-qr', 'payment-qr', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;
