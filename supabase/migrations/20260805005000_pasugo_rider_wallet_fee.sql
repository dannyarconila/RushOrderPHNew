-- Deduct rider wallet fee for every successful standalone Pasugo booking.
-- Fee source: system_settings.key = 'rider_delivery_fee' (internal-admin controlled).

ALTER TABLE public.pasugo_bookings
  ADD COLUMN IF NOT EXISTS rider_fee_per_booking numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_fee_deducted_at timestamptz;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_advance(_job_id uuid, _step text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  rider_wallet_id uuid;
  rider_balance numeric;
  next_balance numeric;
  fee_to_deduct numeric := 0;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.assigned_rider_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'This booking is not assigned to you.';
  END IF;

  IF _step = 'arrived' THEN
    UPDATE public.pasugo_bookings
    SET status = 'rider_arriving',
        updated_at = now()
    WHERE id = j.booking_id;

  ELSIF _step = 'picked_up' THEN
    UPDATE public.pasugo_dispatch_jobs
    SET status = 'picked_up',
        picked_up_at = now(),
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET status = 'on_the_way',
        updated_at = now()
    WHERE id = j.booking_id;

  ELSIF _step = 'delivered' THEN
    UPDATE public.pasugo_dispatch_jobs
    SET status = 'delivered',
        delivered_at = now(),
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET status = 'delivered',
        updated_at = now()
    WHERE id = j.booking_id;

    -- One-time wallet deduction per successful booking.
    SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id FOR UPDATE;

    IF b.rider_fee_deducted_at IS NULL THEN
      SELECT COALESCE(
        (
          SELECT CASE
            WHEN jsonb_typeof(value) = 'number' THEN (value::text)::numeric
            WHEN jsonb_typeof(value) = 'string'
              AND trim(both '"' from value::text) ~ '^-?[0-9]+(\\.[0-9]+)?$'
              THEN (trim(both '"' from value::text))::numeric
            ELSE NULL
          END
          FROM public.system_settings
          WHERE key = 'rider_delivery_fee'
          LIMIT 1
        ),
        0
      ) INTO fee_to_deduct;

      fee_to_deduct := GREATEST(COALESCE(fee_to_deduct, 0), 0);

      IF fee_to_deduct > 0 THEN
        SELECT id, balance INTO rider_wallet_id, rider_balance
        FROM public.wallets
        WHERE user_id = uid
          AND wallet_type = 'rider'
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE;

        IF rider_wallet_id IS NOT NULL THEN
          next_balance := GREATEST(COALESCE(rider_balance, 0) - fee_to_deduct, 0);

          UPDATE public.wallets
          SET balance = next_balance,
              updated_at = now()
          WHERE id = rider_wallet_id;

          INSERT INTO public.wallet_transactions (
            wallet_id,
            amount,
            kind,
            reference,
            description,
            previous_balance,
            new_balance,
            status
          ) VALUES (
            rider_wallet_id,
            -fee_to_deduct,
            'pasugo_booking_fee',
            b.id::text,
            'Pasugo booking fee deduction for completed booking',
            COALESCE(rider_balance, 0),
            next_balance,
            'succeeded'
          );

          UPDATE public.pasugo_bookings
          SET rider_fee_per_booking = fee_to_deduct,
              rider_fee_deducted_at = now(),
              updated_at = now()
          WHERE id = b.id;
        END IF;
      ELSE
        UPDATE public.pasugo_bookings
        SET rider_fee_per_booking = 0,
            rider_fee_deducted_at = now(),
            updated_at = now()
        WHERE id = b.id;
      END IF;
    END IF;

    UPDATE public.rider_status
    SET is_available = true,
        updated_at = now()
    WHERE user_id = uid;

  ELSIF _step = 'completed' THEN
    UPDATE public.pasugo_bookings
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = j.booking_id;

    UPDATE public.rider_status
    SET is_available = true,
        updated_at = now()
    WHERE user_id = uid;

  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.pasugo_dispatch_advance(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_advance(uuid, text) TO authenticated, service_role;
