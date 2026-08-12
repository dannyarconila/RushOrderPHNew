-- ============================================================
-- RushOrder PH
-- Rider Platform Fee + Wallet Accounting Engine
--
-- Business model:
--   Customer: no RushOrder platform fee
--   Rider: platform fee deducted from rider wallet
--   Seller: separate seller-wallet fee system
--
-- Rider fee:
--   base_fee
--   + exact excess distance fee above included_km
--
-- Example:
--   base = 5
--   included = 1 km
--   excess = 2/km
--   distance = 2.7 km
--   fee = 5 + ((2.7 - 1) * 2) = 8.40
-- ============================================================


-- ============================================================
-- 1. ADMIN-CONFIGURABLE RIDER PLATFORM FEE SETTINGS
-- ============================================================

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES
  (
    'rider_platform_fee',
    to_jsonb(5::numeric),
    'Base RushOrder PH platform fee charged to riders per accepted delivery.',
    false
  ),
  (
    'rider_platform_fee_included_km',
    to_jsonb(1::numeric),
    'Distance included in the rider base platform fee before excess-distance charges apply.',
    false
  ),
  (
    'rider_platform_fee_per_excess_km',
    to_jsonb(2::numeric),
    'Additional rider platform fee charged per exact excess kilometer above the included distance.',
    false
  )
ON CONFLICT (key) DO NOTHING;


-- ============================================================
-- 2. ORDER ACCOUNTING FIELDS
-- ============================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rider_platform_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_platform_fee_deducted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rider_platform_fee_refunded_at timestamptz;


-- ============================================================
-- 3. SHARED RIDER PLATFORM-FEE CALCULATOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_rider_platform_fee(
  _distance_km numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_fee numeric := 0;
  included_km numeric := 0;
  excess_fee_per_km numeric := 0;
  distance_km numeric := GREATEST(COALESCE(_distance_km, 0), 0);
  excess_km numeric;
BEGIN
  SELECT COALESCE(
    trim(both '"' FROM value::text)::numeric,
    5
  )
  INTO base_fee
  FROM public.system_settings
  WHERE key = 'rider_platform_fee';

  SELECT COALESCE(
    trim(both '"' FROM value::text)::numeric,
    1
  )
  INTO included_km
  FROM public.system_settings
  WHERE key = 'rider_platform_fee_included_km';

  SELECT COALESCE(
    trim(both '"' FROM value::text)::numeric,
    2
  )
  INTO excess_fee_per_km
  FROM public.system_settings
  WHERE key = 'rider_platform_fee_per_excess_km';

  base_fee := GREATEST(COALESCE(base_fee, 0), 0);
  included_km := GREATEST(COALESCE(included_km, 0), 0);
  excess_fee_per_km := GREATEST(COALESCE(excess_fee_per_km, 0), 0);

  excess_km := GREATEST(distance_km - included_km, 0);

  RETURN ROUND(
    base_fee + (excess_km * excess_fee_per_km),
    2
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_rider_platform_fee(numeric)
FROM public, anon;

GRANT EXECUTE ON FUNCTION public.calculate_rider_platform_fee(numeric)
TO authenticated, service_role;


-- ============================================================
-- 4. MARKETPLACE RIDER FEE REFUND ON ELIGIBLE CANCELLATION
--
-- Current marketplace cancellation authority allows:
--   ready -> cancelled
--
-- A rider cannot currently initiate a separate rider-fault
-- cancellation flow, therefore a charged marketplace delivery
-- that becomes cancelled is refunded.
--
-- The refund is idempotent through rider_platform_fee_refunded_at.
-- ============================================================

CREATE OR REPLACE FUNCTION public.refund_rider_platform_fee_on_order_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rider_wallet_id uuid;
  previous_balance numeric;
  refund_amount numeric;
BEGIN
  IF OLD.status <> 'cancelled'
     AND NEW.status = 'cancelled'
     AND NEW.rider_id IS NOT NULL
     AND COALESCE(NEW.rider_platform_fee, 0) > 0
     AND NEW.rider_platform_fee_deducted_at IS NOT NULL
     AND NEW.rider_platform_fee_refunded_at IS NULL
  THEN
    refund_amount := ROUND(NEW.rider_platform_fee, 2);

    SELECT id, balance
    INTO rider_wallet_id, previous_balance
    FROM public.wallets
    WHERE user_id = NEW.rider_id
      AND wallet_type = 'rider'
      AND deleted_at IS NULL
    FOR UPDATE;

    IF rider_wallet_id IS NULL THEN
      RAISE EXCEPTION
        'Rider wallet not found while refunding platform fee for order %.',
        NEW.id;
    END IF;

    UPDATE public.wallets
    SET balance = COALESCE(balance, 0) + refund_amount,
        updated_at = now()
    WHERE id = rider_wallet_id;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      amount,
      kind,
      reference
    )
    VALUES (
      rider_wallet_id,
      refund_amount,
      'rider_platform_fee_refund',
      'Marketplace order cancellation: ' || NEW.id::text
    );

    NEW.rider_platform_fee_refunded_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_rider_platform_fee_on_order_cancel
ON public.orders;

CREATE TRIGGER trg_refund_rider_platform_fee_on_order_cancel
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.refund_rider_platform_fee_on_order_cancel();


-- ============================================================
-- 5. PASUGO RIDER FEE REFUND ON CANCELLATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.refund_pasugo_rider_platform_fee_on_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rider_wallet_id uuid;
  refund_amount numeric;
BEGIN
  IF OLD.status <> 'cancelled'
     AND NEW.status = 'cancelled'
     AND NEW.assigned_rider_id IS NOT NULL
     AND COALESCE(NEW.rider_fee_per_booking, 0) > 0
     AND NEW.rider_fee_deducted_at IS NOT NULL
  THEN

    /*
     * Reuse the existing deduction timestamp as the guard.
     * Once refunded, reset it to NULL only after the refund ledger
     * is written so the same cancellation cannot refund twice.
     */
    IF EXISTS (
      SELECT 1
      FROM public.wallet_transactions wt
      JOIN public.wallets w ON w.id = wt.wallet_id
      WHERE w.user_id = NEW.assigned_rider_id
        AND w.wallet_type = 'rider'
        AND wt.kind = 'rider_platform_fee_refund'
        AND wt.reference = 'Pasugo cancellation: ' || NEW.id::text
    ) THEN
      RETURN NEW;
    END IF;

    refund_amount := ROUND(NEW.rider_fee_per_booking, 2);

    SELECT id
    INTO rider_wallet_id
    FROM public.wallets
    WHERE user_id = NEW.assigned_rider_id
      AND wallet_type = 'rider'
      AND deleted_at IS NULL
    FOR UPDATE;

    IF rider_wallet_id IS NULL THEN
      RAISE EXCEPTION
        'Rider wallet not found while refunding Pasugo platform fee for booking %.',
        NEW.id;
    END IF;

    UPDATE public.wallets
    SET balance = COALESCE(balance, 0) + refund_amount,
        updated_at = now()
    WHERE id = rider_wallet_id;

    INSERT INTO public.wallet_transactions (
      wallet_id,
      amount,
      kind,
      reference
    )
    VALUES (
      rider_wallet_id,
      refund_amount,
      'rider_platform_fee_refund',
      'Pasugo cancellation: ' || NEW.id::text
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refund_pasugo_rider_platform_fee_on_cancel
ON public.pasugo_bookings;

CREATE TRIGGER trg_refund_pasugo_rider_platform_fee_on_cancel
BEFORE UPDATE OF status ON public.pasugo_bookings
FOR EACH ROW
EXECUTE FUNCTION public.refund_pasugo_rider_platform_fee_on_cancel();


-- ============================================================
-- 6. MARKETPLACE DISPATCH ACCEPT
--
-- Fee is deducted atomically BEFORE the rider is assigned.
-- If wallet deduction fails, the entire RPC transaction rolls back.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;

  required_balance numeric;
  current_balance numeric;

  platform_fee numeric;
  wallet_id uuid;
  previous_balance numeric;
  new_balance numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can accept deliveries.';
  END IF;

  SELECT *
  INTO j
  FROM public.dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  SELECT *
  INTO o
  FROM public.orders
  WHERE id = j.order_id
  FOR UPDATE;

  IF NOT FOUND
     OR o.deleted_at IS NOT NULL
     OR o.status <> 'ready'
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unavailable'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.dispatch_offers
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching'
     OR j.assigned_rider_id IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'taken'
    );
  END IF;

  /*
   * Calculate the authoritative rider platform fee from the
   * dispatch distance. Exact excess kilometers are charged.
   */
  platform_fee :=
    public.calculate_rider_platform_fee(
      COALESCE(j.distance_km, 0)
    );

  /*
   * Lock the rider wallet before checking/deducting balance.
   */
  SELECT id, balance
  INTO wallet_id, current_balance
  FROM public.wallets
  WHERE user_id = uid
    AND wallet_type = 'rider'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF wallet_id IS NULL THEN
    RAISE EXCEPTION 'Rider wallet not found.';
  END IF;

  required_balance :=
    public.minimum_wallet_balance_for_role('rider');

  /*
   * The rider must have enough balance for the platform fee
   * while still satisfying the configured minimum balance.
   */
  IF COALESCE(current_balance, 0)
     < required_balance + platform_fee
  THEN
    RAISE EXCEPTION
      'Your rider wallet needs at least ₱% to accept this booking. Current balance: ₱%.',
      ROUND(required_balance + platform_fee, 2),
      ROUND(COALESCE(current_balance, 0), 2);
  END IF;

  previous_balance := COALESCE(current_balance, 0);
  new_balance := ROUND(previous_balance - platform_fee, 2);

  UPDATE public.wallets
  SET balance = new_balance,
      updated_at = now()
  WHERE id = wallet_id;

  /*
   * Negative amount = wallet debit.
   */
  INSERT INTO public.wallet_transactions (
  wallet_id,
  amount,
  kind,
  reference,
  description,
  previous_balance,
  new_balance,
  status
)
VALUES (
  wallet_id,
  -platform_fee,
  'rider_platform_fee',
  o.id::text,
  'Marketplace delivery platform fee',
  previous_balance,
  new_balance,
  'succeeded'
);

  /*
 * Persist the authoritative platform fee on the order.
 * rider_platform_fee represents a rider wallet deduction,
 * not rider earnings.
 */
  UPDATE public.orders
SET rider_platform_fee = platform_fee,
    rider_platform_fee_deducted_at = now(),
    updated_at = now()
WHERE id = o.id;

  UPDATE public.dispatch_jobs
  SET status = 'assigned',
      assigned_rider_id = uid,
      assigned_at = now(),
      expires_at = NULL,
      updated_at = now()
  WHERE id = j.id;

  UPDATE public.dispatch_offers
  SET status = 'accepted',
      responded_at = now()
  WHERE job_id = j.id
    AND rider_id = uid;

  UPDATE public.dispatch_offers
  SET status = 'cancelled',
      responded_at = now()
  WHERE job_id = j.id
    AND rider_id <> uid
    AND status = 'pending';

  UPDATE public.rider_status
  SET is_available = false,
      active_order_id = j.order_id,
      updated_at = now()
  WHERE user_id = uid;

  UPDATE public.orders
  SET rider_id = uid,
      updated_at = now()
  WHERE id = j.order_id;

  INSERT INTO public.deliveries (
    order_id,
    rider_id,
    status,
    pickup_address,
    dropoff_address,
    fee,
    distance_km,
    claim_number,
    accepted_at
  )
  VALUES (
    j.order_id,
    uid,
    'assigned',
    jsonb_build_object('text', j.pickup_address),
    jsonb_build_object('text', j.dropoff_address),
    j.delivery_fee,
    j.distance_km,
    o.claim_number,
    now()
  )
  ON CONFLICT (order_id) DO UPDATE
  SET rider_id = EXCLUDED.rider_id,
      status = 'assigned',
      accepted_at = now(),
      updated_at = now();

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    o.customer_id,
    'Rider assigned',
    'A rider is on the way to pick up your order.',
    'dispatch'
  );

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  SELECT
    st.owner_id,
    'Rider assigned',
    'A rider accepted the delivery for order '
      || COALESCE(o.claim_number, left(o.id::text, 8))
      || '.',
    'dispatch'
  FROM public.stores st
  WHERE st.id = j.store_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', j.order_id,
    'rider_platform_fee', platform_fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_accept(uuid)
FROM public, anon;

GRANT EXECUTE ON FUNCTION public.dispatch_accept(uuid)
TO authenticated, service_role;


-- ============================================================
-- 7. PASUGO DISPATCH ACCEPT
--
-- Uses the same rider platform-fee calculator.
-- Existing Pasugo fee columns are preserved for compatibility.
-- ============================================================

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();

  required_balance numeric;
  current_balance numeric;

  platform_fee numeric;
  wallet_id uuid;
  previous_balance numeric;
  new_balance numeric;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF NOT public.has_role(uid, 'rider') THEN
    RAISE EXCEPTION 'Only approved riders can accept bookings.';
  END IF;

  SELECT *
  INTO j
  FROM public.pasugo_dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  SELECT *
  INTO b
  FROM public.pasugo_bookings
  WHERE id = j.booking_id
  FOR UPDATE;

  IF NOT FOUND
     OR b.status IN ('cancelled', 'completed')
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'unavailable'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pasugo_dispatch_offers
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching'
     OR j.assigned_rider_id IS NOT NULL
  THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'taken'
    );
  END IF;

  platform_fee :=
    public.calculate_rider_platform_fee(
      COALESCE(j.distance_km, 0)
    );

  SELECT id, balance
  INTO wallet_id, current_balance
  FROM public.wallets
  WHERE user_id = uid
    AND wallet_type = 'rider'
    AND deleted_at IS NULL
  FOR UPDATE;

  IF wallet_id IS NULL THEN
    RAISE EXCEPTION 'Rider wallet not found.';
  END IF;

  required_balance :=
    public.minimum_wallet_balance_for_role('rider');

  IF COALESCE(current_balance, 0)
     < required_balance + platform_fee
  THEN
    RAISE EXCEPTION
      'Your rider wallet needs at least ₱% to accept this booking. Current balance: ₱%.',
      ROUND(required_balance + platform_fee, 2),
      ROUND(COALESCE(current_balance, 0), 2);
  END IF;

  previous_balance := COALESCE(current_balance, 0);
  new_balance := ROUND(previous_balance - platform_fee, 2);

  UPDATE public.wallets
  SET balance = new_balance,
      updated_at = now()
  WHERE id = wallet_id;

  INSERT INTO public.wallet_transactions (
  wallet_id,
  amount,
  kind,
  reference,
  description,
  previous_balance,
  new_balance,
  status
)
VALUES (
  wallet_id,
  -platform_fee,
  'rider_platform_fee',
  b.id::text,
  'Pasugo delivery platform fee',
  previous_balance,
  new_balance,
  'succeeded'
);

  UPDATE public.pasugo_bookings
  SET rider_fee_per_booking = platform_fee,
      rider_fee_deducted_at = now()
  WHERE id = b.id;

  UPDATE public.pasugo_dispatch_jobs
  SET status = 'assigned',
      assigned_rider_id = uid,
      assigned_at = now(),
      expires_at = NULL,
      updated_at = now()
  WHERE id = j.id;

  UPDATE public.pasugo_dispatch_offers
  SET status = 'accepted',
      responded_at = now()
  WHERE job_id = j.id
    AND rider_id = uid;

  UPDATE public.pasugo_dispatch_offers
  SET status = 'cancelled',
      responded_at = now()
  WHERE job_id = j.id
    AND rider_id <> uid
    AND status = 'pending';

  UPDATE public.rider_status
  SET is_available = false,
      updated_at = now()
  WHERE user_id = uid;

  UPDATE public.pasugo_bookings
  SET assigned_rider_id = uid,
      status = 'accepted',
      updated_at = now()
  WHERE id = j.booking_id;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    b.customer_id,
    'Rider assigned',
    'A rider accepted your Pasugo booking.',
    'dispatch'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'booking_id', j.booking_id,
    'rider_platform_fee', platform_fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pasugo_dispatch_accept(uuid)
FROM public, anon;

GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_accept(uuid)
TO authenticated, service_role;


-- ============================================================
-- 8. COMMENTS FOR FUTURE DEVELOPERS
-- ============================================================

COMMENT ON COLUMN public.orders.rider_platform_fee IS
'RushOrder PH platform fee deducted from the rider wallet for this marketplace delivery. This is not rider earnings.';

COMMENT ON COLUMN public.orders.rider_platform_fee_deducted_at IS
'Timestamp when the marketplace rider platform fee was deducted from the rider wallet.';

COMMENT ON COLUMN public.orders.rider_platform_fee_refunded_at IS
'Timestamp when the marketplace rider platform fee was refunded after an eligible cancellation.';