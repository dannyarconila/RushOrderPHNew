-- ============================================================
-- Harden sensitive payment tables with Row Level Security
-- ============================================================

BEGIN;

-- Enable RLS on sensitive payment tables.
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_transactions ENABLE ROW LEVEL SECURITY;

-- Remove broad client-side table privileges.
REVOKE ALL ON TABLE public.payment_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.payment_callbacks FROM anon, authenticated;
REVOKE ALL ON TABLE public.refund_transactions FROM anon, authenticated;

-- Explicitly preserve trusted backend access.
GRANT ALL ON TABLE public.payment_sessions TO service_role;
GRANT ALL ON TABLE public.payment_transactions TO service_role;
GRANT ALL ON TABLE public.payment_callbacks TO service_role;
GRANT ALL ON TABLE public.refund_transactions TO service_role;

COMMIT;
