-- 1. Verification status
DO $$ BEGIN
  CREATE TYPE public.store_verification_status AS ENUM ('pending','verified','suspended','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS verification_status public.store_verification_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS minimum_order numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee_override numeric,
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS phone text;

-- Existing approved stores are treated as verified
UPDATE public.stores SET verification_status = 'verified', verified_at = COALESCE(verified_at, now())
WHERE is_approved AND verification_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_stores_owner ON public.stores (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stores_public ON public.stores (service_type, is_featured, rating DESC)
  WHERE deleted_at IS NULL;

-- 2. Public visibility now requires verification
DROP POLICY IF EXISTS stores_public_read ON public.stores;
CREATE POLICY stores_public_read ON public.stores FOR SELECT TO anon, authenticated
USING (
  is_approved AND is_active AND is_online AND NOT wallet_hold
  AND deleted_at IS NULL AND verification_status = 'verified'
);

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products FOR SELECT TO anon, authenticated
USING (
  is_published AND is_available AND deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = products.store_id
      AND s.is_approved AND s.is_active AND s.is_online AND NOT s.wallet_hold
      AND s.deleted_at IS NULL AND s.verification_status = 'verified'
  )
);

-- 3. Guard admin-only store columns against owner escalation
CREATE OR REPLACE FUNCTION public.guard_store_admin_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
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

  -- Non-admins may never change these
  NEW.is_approved := OLD.is_approved;
  NEW.is_featured := OLD.is_featured;
  NEW.wallet_hold := OLD.wallet_hold;
  NEW.verification_status := OLD.verification_status;
  NEW.verification_notes := OLD.verification_notes;
  NEW.verified_at := OLD.verified_at;
  NEW.rating := OLD.rating;
  NEW.rating_count := OLD.rating_count;
  NEW.owner_id := OLD.owner_id;

  -- Suspended or unverified stores cannot be switched online
  IF NEW.verification_status <> 'verified' THEN
    NEW.is_online := false;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_store_admin_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stores_guard_admin_fields ON public.stores;
CREATE TRIGGER trg_stores_guard_admin_fields
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_admin_fields();

-- 4. New stores created by a seller always start unverified and offline
CREATE OR REPLACE FUNCTION public.guard_store_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.is_approved := false;
    NEW.is_featured := false;
    NEW.is_online := false;
    NEW.verification_status := 'pending';
    NEW.verified_at := NULL;
    NEW.rating := 0;
    NEW.rating_count := 0;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_store_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_stores_guard_insert ON public.stores;
CREATE TRIGGER trg_stores_guard_insert
  BEFORE INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.guard_store_insert();
