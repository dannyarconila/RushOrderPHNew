CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
      OR coalesce(current_setting('app.portal_admin', true), '') = 'on';
$$;
REVOKE ALL ON FUNCTION public.is_portal_admin() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_store_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_portal_admin() THEN
    NEW.is_approved := false;
    NEW.is_featured := false;
    NEW.is_online := false;
    NEW.verification_status := 'pending';
    NEW.verified_at := NULL;
    NEW.rating := 0;
    NEW.rating_count := 0;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_store_admin_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_portal_admin() THEN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      NEW.verified_at := CASE WHEN NEW.verification_status = 'verified' THEN now() ELSE NULL END;
      INSERT INTO public.notifications (user_id, title, body, kind)
      VALUES (
        NEW.owner_id,
        'Store verification updated',
        'Your store "' || NEW.name || '" is now ' || NEW.verification_status || '.'
          || COALESCE(' Note: ' || NULLIF(NEW.verification_notes, ''), ''),
        'store'
      );
    END IF;
    RETURN NEW;
  END IF;

  NEW.is_approved := OLD.is_approved;
  NEW.is_featured := OLD.is_featured;
  NEW.wallet_hold := OLD.wallet_hold;
  NEW.verification_status := OLD.verification_status;
  NEW.verification_notes := OLD.verification_notes;
  NEW.verified_at := OLD.verified_at;
  NEW.rating := OLD.rating;
  NEW.rating_count := OLD.rating_count;
  NEW.owner_id := OLD.owner_id;

  IF NEW.verification_status <> 'verified' THEN
    NEW.is_online := false;
  END IF;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_profile_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_portal_admin() THEN
    NEW.account_status := OLD.account_status;
    NEW.status_note := OLD.status_note;
    NEW.status_changed_at := OLD.status_changed_at;
  ELSIF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_wallet_topup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_portal_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.review_notes := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;
  NEW.amount := OLD.amount;
  NEW.user_id := OLD.user_id;
  NEW.review_notes := OLD.review_notes;
  NEW.reviewed_by := OLD.reviewed_by;
  NEW.reviewed_at := OLD.reviewed_at;
  IF NEW.status NOT IN ('pending', 'cancelled') THEN
    NEW.status := OLD.status;
  END IF;
  RETURN NEW;
END; $$;

-- approval RPCs now accept internal-portal actions too
CREATE OR REPLACE FUNCTION public.approve_wallet_topup(_topup_id uuid, _notes text DEFAULT NULL::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.wallet_topups%ROWTYPE;
  w public.wallets%ROWTYPE;
  tx_id uuid;
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'Only administrators can review top-up requests.';
  END IF;

  SELECT * INTO t FROM public.wallet_topups WHERE id = _topup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Top-up request not found.'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been reviewed.'; END IF;

  SELECT * INTO w FROM public.wallets
   WHERE user_id = t.user_id AND wallet_type = t.wallet_type AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.wallets (user_id, wallet_type) VALUES (t.user_id, t.wallet_type)
    RETURNING * INTO w;
  END IF;

  UPDATE public.wallets SET balance = balance + t.amount, updated_at = now() WHERE id = w.id;

  INSERT INTO public.wallet_transactions
    (wallet_id, amount, kind, reference, previous_balance, new_balance, status, description, provider_code)
  VALUES (w.id, t.amount, 'topup', t.reference_number, w.balance, w.balance + t.amount, 'succeeded',
    'Wallet top-up via ' || t.payment_method_name, NULL)
  RETURNING id INTO tx_id;

  UPDATE public.wallet_topups
     SET status = 'approved', review_notes = _notes, reviewed_by = auth.uid(),
         reviewed_at = now(), wallet_id = w.id, updated_at = now()
   WHERE id = t.id;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (t.user_id, 'Wallet credited',
    'Your top-up of PHP ' || to_char(t.amount, 'FM999999990.00') || ' was approved and credited to your ' ||
    t.wallet_type || ' wallet.', 'wallet');

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'wallet_topup_approved', 'wallet_topups', t.id,
    jsonb_build_object('amount', t.amount, 'wallet_id', w.id, 'transaction_id', tx_id));

  RETURN tx_id;
END; $$;

CREATE OR REPLACE FUNCTION public.reject_wallet_topup(_topup_id uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t public.wallet_topups%ROWTYPE;
BEGIN
  IF NOT public.is_portal_admin() THEN
    RAISE EXCEPTION 'Only administrators can review top-up requests.';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'A rejection reason is required.';
  END IF;

  SELECT * INTO t FROM public.wallet_topups WHERE id = _topup_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Top-up request not found.'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been reviewed.'; END IF;

  UPDATE public.wallet_topups
     SET status = 'rejected', review_notes = _reason, reviewed_by = auth.uid(),
         reviewed_at = now(), updated_at = now()
   WHERE id = t.id;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (t.user_id, 'Top-up rejected',
    'Your top-up of PHP ' || to_char(t.amount, 'FM999999990.00') || ' was rejected. Reason: ' || _reason, 'wallet');

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (auth.uid(), 'wallet_topup_rejected', 'wallet_topups', t.id, jsonb_build_object('reason', _reason));

  RETURN true;
END; $$;

-- Internal-portal only entry points (service_role / trusted server code)
CREATE OR REPLACE FUNCTION public.admin_portal_set_account_status(_user_id uuid, _status public.account_status, _note text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.portal_admin', 'on', true);
  UPDATE public.profiles SET account_status = _status, status_note = _note WHERE id = _user_id;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_portal_set_store_verification(_store_id uuid, _status public.store_verification_status, _notes text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.portal_admin', 'on', true);
  UPDATE public.stores
     SET verification_status = _status,
         verification_notes = _notes,
         is_active = (_status = 'verified'),
         is_online = CASE WHEN _status = 'verified' THEN is_online ELSE false END
   WHERE id = _store_id;
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_portal_approve_topup(_topup_id uuid, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.portal_admin', 'on', true);
  RETURN public.approve_wallet_topup(_topup_id, _notes);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_portal_reject_topup(_topup_id uuid, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.portal_admin', 'on', true);
  RETURN public.reject_wallet_topup(_topup_id, _reason);
END; $$;

REVOKE ALL ON FUNCTION public.admin_portal_set_account_status(uuid, public.account_status, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_portal_set_store_verification(uuid, public.store_verification_status, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_portal_approve_topup(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_portal_reject_topup(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_portal_set_account_status(uuid, public.account_status, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_portal_set_store_verification(uuid, public.store_verification_status, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_portal_approve_topup(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_portal_reject_topup(uuid, text) TO service_role;