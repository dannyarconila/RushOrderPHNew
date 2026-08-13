-- ============================================================
-- RushOrder PH — Customer Service Platform Settings
-- ============================================================

INSERT INTO public.system_settings
  (key, value, description, is_public)
VALUES
  (
    'customer_service_email',
    to_jsonb('support@rushorderph.online'::text),
    'Public customer service email displayed across customer, seller, and rider workspaces',
    true
  ),
  (
    'customer_service_phone',
    to_jsonb(''::text),
    'Public customer service phone number displayed across customer, seller, and rider workspaces',
    true
  ),
  (
    'customer_service_hours',
    to_jsonb('8:00 AM - 10:00 PM daily'::text),
    'Public customer service operating hours',
    true
  ),
  (
    'customer_service_enabled',
    to_jsonb(true),
    'Enable or disable customer service contact information across the platform',
    true
  )
ON CONFLICT (key) DO NOTHING;
