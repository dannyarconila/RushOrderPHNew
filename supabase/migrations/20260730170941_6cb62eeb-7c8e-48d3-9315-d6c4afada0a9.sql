-- ============ payment methods (admin configurable, manual QR phase 1) ============
CREATE TABLE public.payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  account_name text,
  account_number text,
  qr_image_path text,
  instructions text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_methods TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;
GRANT ALL ON public.payment_methods TO service_role;

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_methods_public_read_active" ON public.payment_methods
  FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "payment_methods_admin_insert" ON public.payment_methods
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "payment_methods_admin_update" ON public.payment_methods
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "payment_methods_admin_delete" ON public.payment_methods
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_payment_methods_updated_at BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_methods (code, name, account_name, account_number, instructions, is_active, sort_order)
VALUES ('gcash', 'GCash', 'RushOrder PH', '0900 000 0000',
  E'1. Open your GCash app and scan the QR code (or send to the number above).\n2. Enter the exact amount you are topping up.\n3. Take a screenshot of the receipt.\n4. Enter the GCash reference number and upload the screenshot below.',
  true, 1);

-- ============ wallet top-up requests ============
CREATE TYPE public.topup_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_type public.wallet_type NOT NULL,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  payment_method_id uuid REFERENCES public.payment_methods(id) ON DELETE SET NULL,
  payment_method_name text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  reference_number text NOT NULL,
  proof_path text,
  status public.topup_status NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_topups_user ON public.wallet_topups (user_id, created_at DESC);
CREATE INDEX idx_wallet_topups_status ON public.wallet_topups (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;

ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_topups_select_own_or_admin" ON public.wallet_topups
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "wallet_topups_insert_own" ON public.wallet_topups
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- owners may only cancel their own pending requests; admins reviewed via RPC
CREATE POLICY "wallet_topups_update_own_pending" ON public.wallet_topups
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending')
  WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_wallet_topups_updated_at BEFORE UPDATE ON public.wallet_topups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Non-admin submitters can never self-approve: force pending on insert and
-- restrict which fields a submitter may change afterwards.
CREATE OR REPLACE FUNCTION public.guard_wallet_topup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.review_notes := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;
  -- owners may only cancel
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

CREATE TRIGGER trg_wallet_topups_guard BEFORE INSERT OR UPDATE ON public.wallet_topups
  FOR EACH ROW EXECUTE FUNCTION public.guard_wallet_topup();

CREATE OR REPLACE FUNCTION public.notify_topup_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (NEW.user_id, 'Top-up request submitted',
    'We received your ' || NEW.payment_method_name || ' top-up request for PHP ' || to_char(NEW.amount, 'FM999999990.00') ||
    '. It will be credited once an administrator verifies your payment.', 'wallet');
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_wallet_topups_notify AFTER INSERT ON public.wallet_topups
  FOR EACH ROW EXECUTE FUNCTION public.notify_topup_submitted();

-- ============ admin review RPCs ============
CREATE OR REPLACE FUNCTION public.approve_wallet_topup(_topup_id uuid, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.wallet_topups%ROWTYPE;
  w public.wallets%ROWTYPE;
  tx_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

  UPDATE public.wallets SET balance = balance + t.amount, updated_at = now()
   WHERE id = w.id;

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
  IF NOT public.has_role(auth.uid(), 'admin') THEN
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

REVOKE EXECUTE ON FUNCTION public.guard_wallet_topup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_topup_submitted() FROM PUBLIC, anon, authenticated;

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES ('allow_application_reapply', to_jsonb(true), 'Allow rejected seller/rider applicants to submit a new application', true)
ON CONFLICT (key) DO NOTHING;