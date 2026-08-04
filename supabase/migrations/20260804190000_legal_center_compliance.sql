-- Legal Center compliance schema for RushOrder PH.
-- Adds legal document versioning, acceptance tracking, and consent columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS accepted_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text;

ALTER TABLE public.seller_applications
  ADD COLUMN IF NOT EXISTS accepted_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text;

ALTER TABLE public.rider_applications
  ADD COLUMN IF NOT EXISTS accepted_terms boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepted_terms_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text,
  ADD COLUMN IF NOT EXISTS privacy_version text;

CREATE TABLE IF NOT EXISTS public.legal_documents (
  slug text PRIMARY KEY,
  title text NOT NULL,
  summary text,
  content text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0.0',
  is_published boolean NOT NULL DEFAULT true,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.admin_accounts(id) ON DELETE SET NULL
);

GRANT SELECT ON public.legal_documents TO anon, authenticated;
GRANT ALL ON public.legal_documents TO service_role;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_documents_public_read ON public.legal_documents;
CREATE POLICY legal_documents_public_read ON public.legal_documents
FOR SELECT TO anon, authenticated
USING (is_published);

DROP TRIGGER IF EXISTS trg_legal_documents_updated_at ON public.legal_documents;
CREATE TRIGGER trg_legal_documents_updated_at
  BEFORE UPDATE ON public.legal_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.legal_acceptance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience public.app_role NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  source text NOT NULL DEFAULT 'web',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_acceptance_user ON public.legal_acceptance_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_legal_acceptance_audience ON public.legal_acceptance_logs (audience, accepted_at DESC);

GRANT SELECT ON public.legal_acceptance_logs TO authenticated;
GRANT ALL ON public.legal_acceptance_logs TO service_role;
ALTER TABLE public.legal_acceptance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_acceptance_logs_read_own ON public.legal_acceptance_logs;
CREATE POLICY legal_acceptance_logs_read_own ON public.legal_acceptance_logs
FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.capture_seller_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.accepted_terms THEN
    INSERT INTO public.legal_acceptance_logs (
      user_id,
      audience,
      terms_version,
      privacy_version,
      source,
      metadata,
      accepted_at
    ) VALUES (
      NEW.user_id,
      'seller',
      COALESCE(NULLIF(NEW.terms_version, ''), '1.0.0'),
      COALESCE(NULLIF(NEW.privacy_version, ''), '1.0.0'),
      'seller_application',
      jsonb_build_object('application_id', NEW.id),
      COALESCE(NEW.accepted_terms_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_rider_legal_acceptance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.accepted_terms THEN
    INSERT INTO public.legal_acceptance_logs (
      user_id,
      audience,
      terms_version,
      privacy_version,
      source,
      metadata,
      accepted_at
    ) VALUES (
      NEW.user_id,
      'rider',
      COALESCE(NULLIF(NEW.terms_version, ''), '1.0.0'),
      COALESCE(NULLIF(NEW.privacy_version, ''), '1.0.0'),
      'rider_application',
      jsonb_build_object('application_id', NEW.id),
      COALESCE(NEW.accepted_terms_at, now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_seller_legal_acceptance ON public.seller_applications;
CREATE TRIGGER trg_capture_seller_legal_acceptance
  AFTER INSERT ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.capture_seller_legal_acceptance();

DROP TRIGGER IF EXISTS trg_capture_rider_legal_acceptance ON public.rider_applications;
CREATE TRIGGER trg_capture_rider_legal_acceptance
  AFTER INSERT ON public.rider_applications
  FOR EACH ROW EXECUTE FUNCTION public.capture_rider_legal_acceptance();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  accepted boolean := COALESCE((NEW.raw_user_meta_data->>'accepted_terms')::boolean, false);
  accepted_at timestamptz := CASE
    WHEN COALESCE((NEW.raw_user_meta_data->>'accepted_terms')::boolean, false) THEN now()
    ELSE NULL
  END;
  terms_v text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'terms_version', ''), '1.0.0');
  privacy_v text := COALESCE(NULLIF(NEW.raw_user_meta_data->>'privacy_version', ''), '1.0.0');
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, accepted_terms, accepted_terms_at, terms_version, privacy_version)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'phone',
    accepted,
    accepted_at,
    terms_v,
    privacy_v
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id, role) DO NOTHING;

  IF accepted THEN
    INSERT INTO public.legal_acceptance_logs (
      user_id,
      audience,
      terms_version,
      privacy_version,
      source,
      accepted_at
    ) VALUES (
      NEW.id,
      'customer',
      terms_v,
      privacy_v,
      'register',
      accepted_at
    );
  END IF;

  RETURN NEW;
END;
$$;

INSERT INTO public.legal_documents (slug, title, summary, version, is_published, published_at)
VALUES
  ('terms-conditions', 'Terms & Conditions', 'General terms for all RushOrder PH users.', '1.0.0', true, now()),
  ('privacy-policy', 'Privacy Policy', 'How RushOrder PH collects, uses and protects personal data.', '1.0.0', true, now()),
  ('seller-terms-conditions', 'Seller Terms & Conditions', 'Rules and responsibilities for selling partners.', '1.0.0', true, now()),
  ('rider-terms-conditions', 'Rider Terms & Conditions', 'Rules and responsibilities for riders.', '1.0.0', true, now()),
  ('acceptable-use-policy', 'Acceptable Use Policy', 'Permitted behavior and platform-safe usage standards.', '1.0.0', true, now()),
  ('prohibited-items-policy', 'Prohibited Items Policy', 'Goods and categories that are not allowed on the platform.', '1.0.0', true, now()),
  ('refund-cancellation-policy', 'Refund & Cancellation Policy', 'Refund eligibility and cancellation handling.', '1.0.0', true, now()),
  ('community-guidelines', 'Community Guidelines', 'Community behavior expectations across customers, sellers and riders.', '1.0.0', true, now()),
  ('cookie-policy', 'Cookie Policy', 'Cookie categories and controls used by RushOrder PH.', '1.0.0', true, now()),
  ('intellectual-property-policy', 'Intellectual Property Policy', 'Ownership and IP protection rules.', '1.0.0', true, now()),
  ('data-privacy-notice', 'Data Privacy Notice', 'Notice under the Philippine Data Privacy Act of 2012.', '1.0.0', true, now()),
  ('trust-safety', 'Trust & Safety', 'Identity checks, fraud controls and security monitoring.', '1.0.0', true, now()),
  ('contact-legal-inquiries', 'Contact & Legal Inquiries', 'How to reach RushOrder PH legal and compliance contacts.', '1.0.0', true, now())
ON CONFLICT (slug) DO UPDATE
SET title = EXCLUDED.title,
    summary = COALESCE(public.legal_documents.summary, EXCLUDED.summary),
    is_published = true;

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES
  ('legal_terms_version', '"1.0.0"'::jsonb, 'Current customer Terms & Conditions version.', true),
  ('legal_privacy_version', '"1.0.0"'::jsonb, 'Current Privacy Policy version.', true),
  ('legal_seller_terms_version', '"1.0.0"'::jsonb, 'Current Seller Terms & Conditions version.', true),
  ('legal_rider_terms_version', '"1.0.0"'::jsonb, 'Current Rider Terms & Conditions version.', true)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.system_settings (key, value, description, is_public)
VALUES
  ('legal_doc_terms-conditions', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for terms-conditions.', true),
  ('legal_doc_privacy-policy', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for privacy-policy.', true),
  ('legal_doc_seller-terms-conditions', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for seller-terms-conditions.', true),
  ('legal_doc_rider-terms-conditions', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for rider-terms-conditions.', true),
  ('legal_doc_acceptable-use-policy', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for acceptable-use-policy.', true),
  ('legal_doc_prohibited-items-policy', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for prohibited-items-policy.', true),
  ('legal_doc_refund-cancellation-policy', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for refund-cancellation-policy.', true),
  ('legal_doc_community-guidelines', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for community-guidelines.', true),
  ('legal_doc_cookie-policy', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for cookie-policy.', true),
  ('legal_doc_intellectual-property-policy', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for intellectual-property-policy.', true),
  ('legal_doc_data-privacy-notice', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for data-privacy-notice.', true),
  ('legal_doc_trust-safety', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for trust-safety.', true),
  ('legal_doc_contact-legal-inquiries', jsonb_build_object('version','1.0.0','publishedAt',now()::text,'updatedAt',now()::text,'updatedBy','RushOrder PH Legal Team','content',''), 'Legal document payload for contact-legal-inquiries.', true)
ON CONFLICT (key) DO NOTHING;
