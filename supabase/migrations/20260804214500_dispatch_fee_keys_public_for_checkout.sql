-- Permanent fee-source alignment:
-- Checkout and marketplace pricing read dispatch fee settings managed from
-- Internal Admin > Dispatch by exposing only fee-related keys as public.

UPDATE public.system_settings
SET is_public = true,
    updated_at = now()
WHERE key IN ('dispatch_fee_per_km', 'dispatch_min_fee', 'dispatch_max_fee');
