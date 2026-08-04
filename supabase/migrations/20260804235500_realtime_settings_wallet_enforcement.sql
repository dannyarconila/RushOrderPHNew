-- Realtime enforcement when admin changes wallet minimum settings.
-- Ensures seller stores/rider presence update immediately without manual refresh.

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
  -- Sellers: below minimum -> offline + wallet hold, otherwise online + no hold.
  UPDATE public.stores s
  SET wallet_hold = CASE WHEN COALESCE(w.balance, 0) < required_seller THEN true ELSE false END,
      is_online = CASE WHEN COALESCE(w.balance, 0) < required_seller THEN false ELSE true END,
      updated_at = now()
  FROM public.wallets w
  WHERE w.user_id = s.owner_id
    AND w.wallet_type = 'seller'
    AND w.deleted_at IS NULL
    AND s.deleted_at IS NULL;

  -- Riders: below minimum -> offline, otherwise online.
  INSERT INTO public.rider_status (user_id, is_online, last_seen_at)
  SELECT
    w.user_id,
    CASE WHEN COALESCE(w.balance, 0) < required_rider THEN false ELSE true END,
    now()
  FROM public.wallets w
  WHERE w.wallet_type = 'rider'
    AND w.deleted_at IS NULL
  ON CONFLICT (user_id) DO UPDATE
    SET is_online = EXCLUDED.is_online,
        last_seen_at = now(),
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.on_min_wallet_setting_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key IN ('minimum_seller_wallet_balance', 'minimum_rider_wallet_balance') THEN
    PERFORM public.enforce_wallet_thresholds_from_settings();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_settings_wallet_threshold_enforce ON public.system_settings;
CREATE TRIGGER trg_system_settings_wallet_threshold_enforce
AFTER INSERT OR UPDATE OF value ON public.system_settings
FOR EACH ROW
WHEN (NEW.key IN ('minimum_seller_wallet_balance', 'minimum_rider_wallet_balance'))
EXECUTE FUNCTION public.on_min_wallet_setting_changed();

-- Run once now so current settings are enforced immediately.
SELECT public.enforce_wallet_thresholds_from_settings();

REVOKE ALL ON FUNCTION public.enforce_wallet_thresholds_from_settings() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_wallet_thresholds_from_settings() TO service_role;
