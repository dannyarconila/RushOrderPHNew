-- 1) Single approval workflow: application decision drives roles, store and products
CREATE OR REPLACE FUNCTION public.handle_application_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  target_role public.app_role;
  target_wallet public.wallet_type;
  v_store_name text;
  v_store_id uuid;
BEGIN
  -- Approval/rejection is an administrative act: allow guarded columns to change.
  PERFORM set_config('app.portal_admin', 'on', true);

  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF TG_TABLE_NAME = 'seller_applications' THEN
      target_role := 'seller'; target_wallet := 'seller';
    ELSE
      target_role := 'rider'; target_wallet := 'rider';
    END IF;

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, target_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.wallets (user_id, wallet_type) VALUES (NEW.user_id, target_wallet)
      ON CONFLICT (user_id, wallet_type) DO NOTHING;

    UPDATE public.wallets SET is_active = true, deleted_at = NULL, updated_at = now()
     WHERE user_id = NEW.user_id AND wallet_type = target_wallet;

    -- Account must be usable after approval
    UPDATE public.profiles SET account_status = 'active', status_note = NULL
     WHERE id = NEW.user_id AND account_status <> 'active';

    IF TG_TABLE_NAME = 'seller_applications' THEN
      v_store_name := COALESCE(
        NULLIF(NEW.store_info->>'store_name', ''),
        NULLIF(NEW.business_info->>'business_name', ''),
        'RushOrder Store'
      );

      SELECT id INTO v_store_id FROM public.stores
       WHERE owner_id = NEW.user_id AND deleted_at IS NULL
       ORDER BY created_at LIMIT 1;

      IF v_store_id IS NULL THEN
        INSERT INTO public.stores (
          owner_id, name, description, address, service_type,
          is_approved, is_active, is_online, wallet_hold,
          verification_status, verification_notes, verified_at
        ) VALUES (
          NEW.user_id,
          v_store_name,
          NULLIF(NEW.store_info->>'description', ''),
          COALESCE(NEW.address, '{}'::jsonb),
          COALESCE(NULLIF(NEW.store_info->>'service_type', ''), 'food'),
          true, true, true, false,
          'verified', NULL, now()
        )
        RETURNING id INTO v_store_id;
      ELSE
        UPDATE public.stores
           SET is_approved = true,
               is_active = true,
               is_online = true,
               wallet_hold = false,
               verification_status = 'verified',
               verification_notes = NULL,
               verified_at = now(),
               updated_at = now()
         WHERE id = v_store_id;
      END IF;

      -- Publish the partner's catalogue: no verification gate on products
      UPDATE public.products
         SET is_published = true, updated_at = now()
       WHERE store_id = v_store_id AND deleted_at IS NULL AND is_published = false;
    END IF;

    NEW.reviewed_at := now();

    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (
      NEW.user_id,
      CASE WHEN target_role = 'seller' THEN 'Your store is now live'
           ELSE 'Your rider account is now active' END,
      CASE WHEN target_role = 'seller'
           THEN 'Your storefront is verified and visible in the marketplace. Manage your products, hours and orders from your partner dashboard.'
           ELSE 'Your rider dashboard, wallet and delivery assignments are now enabled. Go online to start accepting deliveries.' END,
      'application'
    );
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    IF TG_TABLE_NAME = 'seller_applications' THEN
      target_role := 'seller';
    ELSE
      target_role := 'rider';
    END IF;

    -- Revoke access so no module shows an approved state
    DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role = target_role;

    IF TG_TABLE_NAME = 'seller_applications' THEN
      UPDATE public.stores
         SET verification_status = 'rejected',
             verification_notes = NULLIF(NEW.review_notes, ''),
             is_approved = false,
             is_active = false,
             is_online = false,
             verified_at = NULL,
             updated_at = now()
       WHERE owner_id = NEW.user_id AND deleted_at IS NULL;
    END IF;

    NEW.reviewed_at := now();
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (
      NEW.user_id,
      'Application update',
      COALESCE(NULLIF(NEW.review_notes, ''), 'Your application was not approved at this time. You can review the requirements and apply again.'),
      'application'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Verification governs marketplace presence; opening hours govern ordering.
DROP POLICY IF EXISTS stores_public_read ON public.stores;
CREATE POLICY stores_public_read ON public.stores
FOR SELECT TO anon, authenticated
USING (
  is_approved
  AND is_active
  AND NOT wallet_hold
  AND deleted_at IS NULL
  AND verification_status = 'verified'
);

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products
FOR SELECT TO anon, authenticated
USING (
  is_published
  AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.stores s
     WHERE s.id = products.store_id
       AND s.is_approved AND s.is_active AND NOT s.wallet_hold
       AND s.deleted_at IS NULL
       AND s.verification_status = 'verified'
  )
);

-- 3) A verified store may stay open; only unverified stores are forced offline.
CREATE OR REPLACE FUNCTION public.guard_store_admin_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.is_portal_admin() THEN
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
      NEW.verified_at := CASE WHEN NEW.verification_status = 'verified' THEN now() ELSE NULL END;
      IF NEW.verification_status <> 'verified' THEN
        NEW.is_online := false;
        NEW.is_active := false;
      END IF;
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
END; $function$;

-- 4) Verifying a store from the admin portal must also publish its catalogue.
CREATE OR REPLACE FUNCTION public.admin_portal_set_store_verification(_store_id uuid, _status store_verification_status, _notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.portal_admin', 'on', true);
  UPDATE public.stores
     SET verification_status = _status,
         verification_notes = _notes,
         is_approved = (_status = 'verified'),
         is_active = (_status = 'verified'),
         is_online = CASE WHEN _status = 'verified' THEN true ELSE false END
   WHERE id = _store_id;

  IF _status = 'verified' THEN
    UPDATE public.products
       SET is_published = true, updated_at = now()
     WHERE store_id = _store_id AND deleted_at IS NULL AND is_published = false;
  END IF;

  RETURN FOUND;
END; $function$;

-- 5) Realtime so every dashboard stays in sync without a refresh
ALTER TABLE public.stores REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.user_roles REPLICA IDENTITY FULL;
ALTER TABLE public.seller_applications REPLICA IDENTITY FULL;
ALTER TABLE public.rider_applications REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stores','products','user_roles','seller_applications','rider_applications','notifications','orders','wallets']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;