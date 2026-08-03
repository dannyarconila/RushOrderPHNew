-- Capture schema changes that existed in the original Lovable database but
-- were missing from its exported migration history. Later migrations depend
-- on these objects, so this file must sort before 20260730082004.

DO $$ BEGIN CREATE TYPE public.wallet_type AS ENUM ('seller', 'rider'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_method AS ENUM ('cod', 'gcash', 'wallet', 'maya', 'card', 'bank_transfer', 'qrph'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.payment_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'expired', 'refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.application_status ADD VALUE IF NOT EXISTS 'under_review';

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS barangay text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS recipient_name text;

ALTER TABLE public.seller_applications
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.rider_applications
  ADD COLUMN IF NOT EXISTS device_fingerprint text,
  ADD COLUMN IF NOT EXISTS ip_address text;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS business_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_fee_override numeric,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS minimum_order numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS rating numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_type text NOT NULL DEFAULT 'food',
  ADD COLUMN IF NOT EXISTS wallet_hold boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS claim_number text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS distance_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method NOT NULL DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rider_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_commission numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax numeric NOT NULL DEFAULT 0;

ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_number text,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS distance_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rider_latitude numeric,
  ADD COLUMN IF NOT EXISTS rider_longitude numeric;

ALTER TABLE public.wallets DROP CONSTRAINT IF EXISTS wallets_user_id_key;
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS wallet_type public.wallet_type NOT NULL DEFAULT 'seller';
DO $$ BEGIN
  ALTER TABLE public.wallets ADD CONSTRAINT wallets_user_id_wallet_type_key UNIQUE (user_id, wallet_type);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS new_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
  ADD COLUMN IF NOT EXISTS previous_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_code text,
  ADD COLUMN IF NOT EXISTS status public.payment_status NOT NULL DEFAULT 'pending';

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE,
  value jsonb NOT NULL DEFAULT 'null'::jsonb, description text,
  is_public boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_settings TO anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY system_settings_public_read ON public.system_settings FOR SELECT TO anon, authenticated USING (is_public);

CREATE TABLE IF NOT EXISTS public.payment_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb, is_enabled boolean NOT NULL DEFAULT false,
  supports_qr boolean NOT NULL DEFAULT false, supports_redirect boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_providers TO anon, authenticated;
GRANT ALL ON public.payment_providers TO service_role;
ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_providers_public_read ON public.payment_providers FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  provider_code text NOT NULL REFERENCES public.payment_providers(code), provider_reference text,
  reference text NOT NULL UNIQUE, purpose text NOT NULL DEFAULT 'order', amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'PHP', status public.payment_status NOT NULL DEFAULT 'pending',
  checkout_url text, qr_payload text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'), completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid REFERENCES public.payment_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, provider_code text NOT NULL REFERENCES public.payment_providers(code),
  provider_reference text, reference text NOT NULL UNIQUE, amount numeric NOT NULL, fee numeric NOT NULL DEFAULT 0,
  payment_method public.payment_method NOT NULL DEFAULT 'gcash', status public.payment_status NOT NULL DEFAULT 'pending',
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_callbacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_code text NOT NULL, reference text,
  signature text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, is_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false, error text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refund_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  reference text NOT NULL UNIQUE, amount numeric NOT NULL, reason text,
  status public.payment_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
