-- Enforce seller/rider application completeness before approval.
-- This is intentionally database-enforced so incomplete applications
-- cannot be approved through an old client, direct UPDATE, or admin RPC.

CREATE OR REPLACE FUNCTION public.application_missing_requirements(
  _kind text,
  _business_type text DEFAULT NULL,
  _business_info jsonb DEFAULT '{}'::jsonb,
  _owner_info jsonb DEFAULT '{}'::jsonb,
  _personal_info jsonb DEFAULT '{}'::jsonb,
  _address jsonb DEFAULT '{}'::jsonb,
  _vehicle_info jsonb DEFAULT '{}'::jsonb,
  _store_info jsonb DEFAULT '{}'::jsonb,
  _documents jsonb DEFAULT '{}'::jsonb,
  _emergency_contact jsonb DEFAULT '{}'::jsonb
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  missing text[] := ARRAY[]::text[];
  vehicle_type text := btrim(COALESCE(_vehicle_info ->> 'vehicle_type', ''));
BEGIN
  IF _kind = 'rider' THEN

    IF btrim(COALESCE(_personal_info ->> 'full_name', '')) = '' THEN
      missing := array_append(missing, 'Full name');
    END IF;

    IF btrim(COALESCE(_personal_info ->> 'email', '')) = '' THEN
      missing := array_append(missing, 'Email');
    END IF;

    IF btrim(COALESCE(_personal_info ->> 'phone', '')) = '' THEN
      missing := array_append(missing, 'Mobile number');
    END IF;

    IF btrim(COALESCE(_personal_info ->> 'birthdate', '')) = '' THEN
      missing := array_append(missing, 'Date of birth');
    END IF;

    IF btrim(COALESCE(_address ->> 'street', '')) = '' THEN
      missing := array_append(missing, 'Street / building');
    END IF;

    IF btrim(COALESCE(_address ->> 'barangay', '')) = '' THEN
      missing := array_append(missing, 'Barangay');
    END IF;

    IF btrim(COALESCE(_address ->> 'city', '')) = '' THEN
      missing := array_append(missing, 'City / municipality');
    END IF;

    IF btrim(COALESCE(_address ->> 'province', '')) = '' THEN
      missing := array_append(missing, 'Province');
    END IF;

    IF btrim(COALESCE(_address ->> 'postal_code', '')) = '' THEN
      missing := array_append(missing, 'Postal code');
    END IF;

    IF vehicle_type = '' THEN
      missing := array_append(missing, 'Vehicle type');
    END IF;

    IF btrim(COALESCE(_vehicle_info ->> 'model', '')) = '' THEN
      missing := array_append(missing, 'Make & model');
    END IF;

    IF vehicle_type <> '' AND vehicle_type <> 'Bicycle' THEN
      IF btrim(COALESCE(_vehicle_info ->> 'plate_number', '')) = '' THEN
        missing := array_append(missing, 'Plate number');
      END IF;

      IF btrim(COALESCE(_vehicle_info ->> 'license_number', '')) = '' THEN
        missing := array_append(missing, 'Driver''s licence number');
      END IF;

      IF btrim(COALESCE(_documents ->> 'drivers_license', '')) = '' THEN
        missing := array_append(missing, 'Driver''s licence document');
      END IF;

      IF btrim(COALESCE(_documents ->> 'or_cr', '')) = '' THEN
        missing := array_append(missing, 'Vehicle OR / CR');
      END IF;
    END IF;

    IF btrim(COALESCE(_documents ->> 'valid_id', '')) = '' THEN
      missing := array_append(missing, 'Government-issued ID');
    END IF;

    IF btrim(COALESCE(_documents ->> 'selfie_with_id', '')) = '' THEN
      missing := array_append(missing, 'Selfie holding your ID');
    END IF;

    IF btrim(COALESCE(_emergency_contact ->> 'contact_name', '')) = '' THEN
      missing := array_append(missing, 'Emergency contact name');
    END IF;

    IF btrim(COALESCE(_emergency_contact ->> 'relationship', '')) = '' THEN
      missing := array_append(missing, 'Emergency contact relationship');
    END IF;

    IF btrim(COALESCE(_emergency_contact ->> 'contact_phone', '')) = '' THEN
      missing := array_append(missing, 'Emergency contact number');
    END IF;

  ELSIF _kind = 'seller' THEN

    IF btrim(COALESCE(_business_info ->> 'business_name', '')) = '' THEN
      missing := array_append(missing, 'Business / selling name');
    END IF;

    IF btrim(COALESCE(_owner_info ->> 'owner_name', '')) = '' THEN
      missing := array_append(missing, 'Owner full name');
    END IF;

    IF btrim(COALESCE(_owner_info ->> 'owner_email', _owner_info ->> 'email', '')) = '' THEN
      missing := array_append(missing, 'Owner email');
    END IF;

    IF btrim(COALESCE(_owner_info ->> 'owner_phone', _owner_info ->> 'phone', '')) = '' THEN
      missing := array_append(missing, 'Owner mobile number');
    END IF;

    IF btrim(COALESCE(_owner_info ->> 'birthdate', '')) = '' THEN
      missing := array_append(missing, 'Owner date of birth');
    END IF;

    IF btrim(COALESCE(_address ->> 'street', _address ->> 'line1', '')) = '' THEN
      missing := array_append(missing, 'Street / building');
    END IF;

    IF btrim(COALESCE(_address ->> 'barangay', '')) = '' THEN
      missing := array_append(missing, 'Barangay');
    END IF;

    IF btrim(COALESCE(_address ->> 'city', '')) = '' THEN
      missing := array_append(missing, 'City / municipality');
    END IF;

    IF btrim(COALESCE(_address ->> 'province', '')) = '' THEN
      missing := array_append(missing, 'Province');
    END IF;

    IF btrim(COALESCE(_address ->> 'postal_code', '')) = '' THEN
      missing := array_append(missing, 'Postal code');
    END IF;

    IF btrim(COALESCE(_store_info ->> 'store_name', '')) = '' THEN
      missing := array_append(missing, 'Store name');
    END IF;

    IF btrim(COALESCE(_store_info ->> 'category', '')) = '' THEN
      missing := array_append(missing, 'Primary category');
    END IF;

    IF btrim(COALESCE(_store_info ->> 'prep_time', '')) = '' THEN
      missing := array_append(missing, 'Average prep time');
    END IF;

    IF btrim(COALESCE(_store_info ->> 'description', '')) = '' THEN
      missing := array_append(missing, 'Store description');
    END IF;

    IF _business_type = 'registered' THEN
      IF btrim(COALESCE(_business_info ->> 'registration_type', '')) = '' THEN
        missing := array_append(missing, 'Registration type');
      END IF;

      IF btrim(COALESCE(_business_info ->> 'registration_number', '')) = '' THEN
        missing := array_append(missing, 'Registration number');
      END IF;

      IF btrim(COALESCE(_business_info ->> 'tin', '')) = '' THEN
        missing := array_append(missing, 'TIN');
      END IF;

      IF btrim(COALESCE(_documents ->> 'business_permit', '')) = '' THEN
        missing := array_append(missing, 'Business permit');
      END IF;

      IF btrim(COALESCE(_documents ->> 'registration_certificate', '')) = '' THEN
        missing := array_append(missing, 'DTI / SEC certificate');
      END IF;

      IF btrim(COALESCE(_documents ->> 'valid_id', '')) = '' THEN
        missing := array_append(missing, 'Owner valid ID');
      END IF;
    ELSE
      IF btrim(COALESCE(_business_info ->> 'registration_type', '')) = '' THEN
        missing := array_append(missing, 'Years selling');
      END IF;

      IF btrim(COALESCE(_documents ->> 'valid_id', '')) = '' THEN
        missing := array_append(missing, 'Government-issued ID');
      END IF;

      IF btrim(COALESCE(_documents ->> 'selfie_with_id', '')) = '' THEN
        missing := array_append(missing, 'Selfie holding your ID');
      END IF;
    END IF;

  ELSE
    missing := array_append(missing, 'Unsupported application type');
  END IF;

  RETURN missing;
END;
$$;


CREATE OR REPLACE FUNCTION public.guard_application_completeness_before_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  missing text[];
BEGIN
  IF NEW.status = 'approved'
     AND OLD.status IS DISTINCT FROM 'approved' THEN

    IF TG_TABLE_NAME = 'rider_applications' THEN
      missing := public.application_missing_requirements(
        'rider',
        NULL,
        '{}'::jsonb,
        '{}'::jsonb,
        NEW.personal_info,
        NEW.address,
        NEW.vehicle_info,
        '{}'::jsonb,
        NEW.documents,
        NEW.emergency_contact
      );
    ELSIF TG_TABLE_NAME = 'seller_applications' THEN
      missing := public.application_missing_requirements(
        'seller',
        NEW.business_type::text,
        NEW.business_info,
        NEW.owner_info,
        '{}'::jsonb,
        NEW.address,
        '{}'::jsonb,
        NEW.store_info,
        NEW.documents,
        '{}'::jsonb
      );
    ELSE
      RAISE EXCEPTION 'Unsupported application table: %', TG_TABLE_NAME;
    END IF;

    IF cardinality(missing) > 0 THEN
      RAISE EXCEPTION
        'Application cannot be approved. Missing required information: %',
        array_to_string(missing, ', ');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS trg_rider_application_completeness
  ON public.rider_applications;

CREATE TRIGGER trg_rider_application_completeness
BEFORE UPDATE ON public.rider_applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_application_completeness_before_approval();


DROP TRIGGER IF EXISTS trg_seller_application_completeness
  ON public.seller_applications;

CREATE TRIGGER trg_seller_application_completeness
BEFORE UPDATE ON public.seller_applications
FOR EACH ROW
EXECUTE FUNCTION public.guard_application_completeness_before_approval();


-- Also expose the same validation to the authoritative admin RPC.
-- The trigger remains the final enforcement boundary.

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
  missing text[];
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

  IF previous_status IN ('approved', 'rejected')
     AND _next_status <> previous_status THEN
    RAISE EXCEPTION
      'Reviewed applications cannot be reopened. Ask the applicant to submit a new application instead.';
  END IF;

  IF _next_status = 'under_review'
     AND previous_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending applications can move to under review.';
  END IF;

  IF _next_status = 'pending'
     AND previous_status <> 'under_review' THEN
    RAISE EXCEPTION 'Only under-review applications can move back to pending.';
  END IF;

  IF _next_status = 'approved'
     AND previous_status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION
      'Only pending or under-review applications can be approved.';
  END IF;

  IF _next_status = 'rejected' THEN
    IF previous_status NOT IN ('pending', 'under_review') THEN
      RAISE EXCEPTION
        'Only pending or under-review applications can be rejected.';
    END IF;

    IF normalized_notes IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required.';
    END IF;
  END IF;

  -- Validate before performing ANY approval side effects.
  IF _next_status = 'approved' THEN
    IF _kind = 'seller' THEN
      missing := public.application_missing_requirements(
        'seller',
        seller_row.business_type::text,
        seller_row.business_info,
        seller_row.owner_info,
        '{}'::jsonb,
        seller_row.address,
        '{}'::jsonb,
        seller_row.store_info,
        seller_row.documents,
        '{}'::jsonb
      );
    ELSE
      missing := public.application_missing_requirements(
        'rider',
        NULL,
        '{}'::jsonb,
        '{}'::jsonb,
        rider_row.personal_info,
        rider_row.address,
        rider_row.vehicle_info,
        '{}'::jsonb,
        rider_row.documents,
        rider_row.emergency_contact
      );
    END IF;

    IF cardinality(missing) > 0 THEN
      RAISE EXCEPTION
        'Application cannot be approved. Missing required information: %',
        array_to_string(missing, ', ');
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
