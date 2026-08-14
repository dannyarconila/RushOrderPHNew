-- ============================================================
-- Automated wallet top-up verification
-- ============================================================

ALTER TABLE public.wallet_topups
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS verification_reason text,
  ADD COLUMN IF NOT EXISTS verified_reference_number text,
  ADD COLUMN IF NOT EXISTS verified_amount numeric,
  ADD COLUMN IF NOT EXISTS verified_recipient text,
  ADD COLUMN IF NOT EXISTS verification_confidence numeric,
  ADD COLUMN IF NOT EXISTS verification_data jsonb,
  ADD COLUMN IF NOT EXISTS verification_attempted_at timestamptz;

ALTER TABLE public.wallet_topups
  ADD CONSTRAINT wallet_topups_verification_status_check
  CHECK (
    verification_status IS NULL
    OR verification_status IN (
      'pending',
      'verified',
      'rejected',
      'manual_review'
    )
  );

CREATE INDEX IF NOT EXISTS idx_wallet_topups_reference_number
  ON public.wallet_topups (reference_number);

CREATE INDEX IF NOT EXISTS idx_wallet_topups_verification_status
  ON public.wallet_topups (verification_status, created_at DESC);