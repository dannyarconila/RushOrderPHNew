CREATE TYPE public.admin_role AS ENUM ('super_admin', 'admin', 'finance', 'support');

CREATE TABLE public.admin_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  password_hash text NOT NULL,
  role public.admin_role NOT NULL DEFAULT 'admin',
  is_active boolean NOT NULL DEFAULT true,
  is_default_credentials boolean NOT NULL DEFAULT false,
  must_change_credentials boolean NOT NULL DEFAULT false,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_login_at timestamptz,
  last_login_ip text,
  created_by uuid REFERENCES public.admin_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX admin_accounts_username_key ON public.admin_accounts (lower(username));

REVOKE ALL ON public.admin_accounts FROM anon, authenticated;
GRANT ALL ON public.admin_accounts TO service_role;
ALTER TABLE public.admin_accounts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_admin_accounts_updated_at
  BEFORE UPDATE ON public.admin_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES public.admin_accounts(id) ON DELETE SET NULL,
  admin_username text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_created_at_idx ON public.admin_audit_logs (created_at DESC);

REVOKE ALL ON public.admin_audit_logs FROM anon, authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

INSERT INTO public.admin_accounts (username, password_hash, role, is_default_credentials, must_change_credentials)
VALUES (
  'Admin',
  'pbkdf2$100000$fbeb963449e71f99ceebf35729dfbadb$92f2301fe13962ff480850c17b79f0700aa0b45ec37117ab4bbbf2efc61a8bdf',
  'super_admin',
  true,
  true
);

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES ('admin_session_timeout_minutes', to_jsonb(30), 'Internal admin portal inactivity timeout in minutes', false)
ON CONFLICT (key) DO NOTHING;