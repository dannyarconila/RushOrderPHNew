-- Admin-controlled customer marketplace radius (km).
-- Stores displayed to customers are filtered by this radius from customer location.
INSERT INTO public.system_settings (key, value, description, is_public)
VALUES (
  'marketplace_customer_radius_km',
  to_jsonb(15),
  'Maximum distance in kilometers for showing stores in customer marketplace results.',
  true
)
ON CONFLICT (key) DO NOTHING;
