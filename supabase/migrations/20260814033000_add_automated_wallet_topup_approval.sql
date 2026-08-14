-- ============================================================
-- Automated wallet top-up approval
--
-- This is NOT exposed to normal authenticated users.
-- It exists specifically for the trusted verification worker.
-- ============================================================

CREATE OR REPLACE FUNCTION public.automated_approve_wallet_topup(
  _topup_id uuid,
  _verification_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.wallet_topups%ROWTYPE;
  w public.wallets%ROWTYPE;
  tx_id uuid;
BEGIN
  -- Only trusted backend execution may call this function.
  IF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Automated wallet approval requires trusted server execution.';
  END IF;

  SELECT *
    INTO t
    FROM public.wallet_topups
   WHERE id = _topup_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up request not found.';
  END IF;

  IF t.status <> 'pending' THEN
    RAISE EXCEPTION 'This request has already been reviewed.';
  END IF;

  SELECT *
    INTO w
    FROM public.wallets
   WHERE user_id = t.user_id
     AND wallet_type = t.wallet_type
     AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (
      user_id,
      wallet_type
    )
    VALUES (
      t.user_id,
      t.wallet_type
    )
    RETURNING * INTO w;
  END IF;

  UPDATE public.wallets
     SET balance = balance + t.amount,
         updated_at = now()
   WHERE id = w.id;

  INSERT INTO public.wallet_transactions (
    wallet_id,
    amount,
    kind,
    reference,
    previous_balance,
    new_balance,
    status,
    description,
    provider_code
  )
  VALUES (
    w.id,
    t.amount,
    'topup',
    t.reference_number,
    w.balance,
    w.balance + t.amount,
    'succeeded',
    'Automated wallet top-up via ' || t.payment_method_name,
    'gcash_automated_verification'
  )
  RETURNING id INTO tx_id;

  UPDATE public.wallet_topups
     SET status = 'approved',
         review_notes = _verification_notes,
         reviewed_by = NULL,
         reviewed_at = now(),
         wallet_id = w.id,
         updated_at = now()
   WHERE id = t.id;

  INSERT INTO public.notifications (
    user_id,
    title,
    body,
    kind
  )
  VALUES (
    t.user_id,
    'Wallet credited',
    'Your top-up of PHP '
      || to_char(t.amount, 'FM999999990.00')
      || ' was automatically verified and credited to your '
      || t.wallet_type
      || ' wallet.',
    'wallet'
  );

  INSERT INTO public.audit_logs (
    actor_id,
    action,
    entity_type,
    entity_id,
    after_data
  )
  VALUES (
    NULL,
    'wallet_topup_automatically_approved',
    'wallet_topups',
    t.id,
    jsonb_build_object(
      'amount', t.amount,
      'wallet_id', w.id,
      'transaction_id', tx_id,
      'verification_notes', _verification_notes
    )
  );

  RETURN tx_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.automated_approve_wallet_topup(uuid, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.automated_approve_wallet_topup(uuid, text)
TO service_role;