-- Make approval welcome credits idempotent per application.
--
-- A welcome bonus belongs to the application approval event, not merely
-- to the user's wallet. The marker prevents accidental duplicate credits
-- if the approval RPC is ever retried or its approval workflow changes.
--
-- Existing applications are left untouched. Existing welcome transactions
-- are preserved as-is.

ALTER TABLE public.seller_applications
  ADD COLUMN IF NOT EXISTS welcome_bonus_credited_at timestamptz;

ALTER TABLE public.rider_applications
  ADD COLUMN IF NOT EXISTS welcome_bonus_credited_at timestamptz;


CREATE OR REPLACE FUNCTION public.admin_portal_review_application(
  _kind text,
  _application_id uuid,
  _next_status public.application_status,
  _notes text DEFAULT NULL,
  _approval_bonus numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_row public.seller_applications%ROWTYPE;
  rider_row public.rider_applications%ROWTYPE;
  normalized_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
  previous_status public.application_status;
  target_user_id uuid;
  target_wallet public.wallet_type;
  configured_bonus numeric := 0;
  approval_bonus numeric := 0;
  wallet_row public.wallets%ROWTYPE;
  previous_balance numeric := 0;
  bonus_already_credited boolean := false;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;

  IF _kind NOT IN ('seller', 'rider') THEN
    RAISE EXCEPTION 'Unsupported application kind: %', _kind;
  END IF;

  PERFORM set_config('app.portal_admin', 'on', true);

  IF _kind = 'seller' THEN
    SELECT *
    INTO seller_row
    FROM public.seller_applications
    WHERE id = _application_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Seller application not found.';
    END IF;

    previous_status := seller_row.status;
    target_user_id := seller_row.user_id;
    target_wallet := 'seller';
    bonus_already_credited := seller_row.welcome_bonus_credited_at IS NOT NULL;
  ELSE
    SELECT *
    INTO rider_row
    FROM public.rider_applications
    WHERE id = _application_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rider application not found.';
    END IF;

    previous_status := rider_row.status;
    target_user_id := rider_row.user_id;
    target_wallet := 'rider';
    bonus_already_credited := rider_row.welcome_bonus_credited_at IS NOT NULL;
  END IF;

  IF previous_status IN ('approved', 'rejected') AND _next_status <> previous_status THEN
    RAISE EXCEPTION 'Reviewed applications cannot be reopened. Ask the applicant to submit a new application instead.';
  END IF;

  IF _next_status = 'under_review' AND previous_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending applications can move to under review.';
  END IF;

  IF _next_status = 'pending' AND previous_status <> 'under_review' THEN
    RAISE EXCEPTION 'Only under-review applications can move back to pending.';
  END IF;

  IF _next_status = 'approved' AND previous_status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION 'Only pending or under-review applications can be approved.';
  END IF;

  IF _next_status = 'rejected' THEN
    IF previous_status NOT IN ('pending', 'under_review') THEN
      RAISE EXCEPTION 'Only pending or under-review applications can be rejected.';
    END IF;

    IF normalized_notes IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required.';
    END IF;
  END IF;

  IF previous_status = _next_status THEN
    RETURN jsonb_build_object(
      'changed', false,
      'user_id', target_user_id,
      'old_status', previous_status,
      'new_status', _next_status,
      'wallet_bonus', 0
    );
  END IF;

  IF _kind = 'seller' THEN
    UPDATE public.seller_applications
    SET
      status = _next_status,
      review_notes = normalized_notes,
      reviewed_at = CASE
        WHEN _next_status IN ('approved', 'rejected') THEN now()
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = _application_id;
  ELSE
    UPDATE public.rider_applications
    SET
      status = _next_status,
      review_notes = normalized_notes,
      reviewed_at = CASE
        WHEN _next_status IN ('approved', 'rejected') THEN now()
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = _application_id;
  END IF;

  IF _next_status = 'approved' AND NOT bonus_already_credited THEN
    SELECT COALESCE((value)::numeric, 0)
    INTO configured_bonus
    FROM public.system_settings
    WHERE key = 'welcome_wallet_bonus';

    approval_bonus := GREATEST(
      COALESCE(_approval_bonus, configured_bonus, 0),
      0
    );

    IF approval_bonus > 0 THEN
      SELECT *
      INTO wallet_row
      FROM public.wallets
      WHERE user_id = target_user_id
        AND wallet_type = target_wallet
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION
          'Approval provisioning did not create the required % wallet.',
          target_wallet;
      END IF;

      previous_balance := COALESCE(wallet_row.balance, 0);

      UPDATE public.wallets
      SET
        balance = previous_balance + approval_bonus,
        updated_at = now()
      WHERE id = wallet_row.id;

      INSERT INTO public.wallet_transactions (
        wallet_id,
        amount,
        kind,
        previous_balance,
        new_balance,
        status,
        description
      )
      VALUES (
        wallet_row.id,
        approval_bonus,
        'welcome',
        previous_balance,
        previous_balance + approval_bonus,
        'succeeded',
        'Welcome Credit'
      );

      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        kind
      )
      VALUES (
        target_user_id,
        'Welcome Credit',
        'A welcome credit of PHP ' ||
          to_char(approval_bonus, 'FM999999990.00') ||
          ' has been added to your wallet.',
        'wallet'
      );

      IF _kind = 'seller' THEN
        UPDATE public.seller_applications
        SET
          welcome_bonus_credited_at = now(),
          updated_at = now()
        WHERE id = _application_id
          AND welcome_bonus_credited_at IS NULL;
      ELSE
        UPDATE public.rider_applications
        SET
          welcome_bonus_credited_at = now(),
          updated_at = now()
        WHERE id = _application_id
          AND welcome_bonus_credited_at IS NULL;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'changed', true,
    'user_id', target_user_id,
    'old_status', previous_status,
    'new_status', _next_status,
    'wallet_bonus',
      CASE
        WHEN bonus_already_credited THEN 0
        ELSE approval_bonus
      END
  );
END;
$$;


REVOKE ALL ON FUNCTION public.admin_portal_review_application(
  text,
  uuid,
  public.application_status,
  text,
  numeric
) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_portal_review_application(
  text,
  uuid,
  public.application_status,
  text,
  numeric
) TO service_role;