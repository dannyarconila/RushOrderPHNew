-- Fix wallet threshold enforcement:
-- Never force a seller or rider ONLINE merely because their balance
-- is above the configured minimum.
--
-- Below minimum:
--   seller -> offline + wallet hold
--   rider  -> offline
--
-- At/above minimum:
--   preserve the user's current online/offline choice.

CREATE OR REPLACE FUNCTION public.enforce_wallet_thresholds_from_settings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_seller numeric := public.minimum_wallet_balance_for_role('seller');
  required_rider numeric := public.minimum_wallet_balance_for_role('rider');
BEGIN
  -- Sellers:
  -- Only force stores offline when the wallet falls below the threshold.
  -- Never automatically bring an offline store back online.
  UPDATE public.stores s
  SET
    wallet_hold = true,
    is_online = false,
    updated_at = now()
  FROM public.wallets w
  WHERE w.user_id = s.owner_id
    AND w.wallet_type = 'seller'
    AND w.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND COALESCE(w.balance, 0) < required_seller;

  -- Sellers whose balance is sufficient are no longer on wallet hold.
  -- Their existing online/offline state is intentionally preserved.
  UPDATE public.stores s
  SET
    wallet_hold = false,
    updated_at = now()
  FROM public.wallets w
  WHERE w.user_id = s.owner_id
    AND w.wallet_type = 'seller'
    AND w.deleted_at IS NULL
    AND s.deleted_at IS NULL
    AND COALESCE(w.balance, 0) >= required_seller;

  -- Riders:
  -- Only force riders offline when their wallet is below the threshold.
  -- Never automatically bring an offline rider back online.
  UPDATE public.rider_status rs
  SET
    is_online = false,
    updated_at = now(),
    last_seen_at = now()
  FROM public.wallets w
  WHERE w.user_id = rs.user_id
    AND w.wallet_type = 'rider'
    AND w.deleted_at IS NULL
    AND COALESCE(w.balance, 0) < required_rider;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_wallet_thresholds_from_settings()
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_wallet_thresholds_from_settings()
  TO service_role;

COMMENT ON FUNCTION public.enforce_wallet_thresholds_from_settings()
IS
'Enforces minimum wallet thresholds by forcing below-threshold sellers and riders offline while preserving the intentional online/offline state of users whose balance is sufficient.';