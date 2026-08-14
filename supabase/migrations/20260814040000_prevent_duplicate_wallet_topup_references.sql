-- ============================================================
-- Prevent duplicate wallet top-up references.
--
-- GCash references may be entered with spaces or separators,
-- so uniqueness is enforced against the normalized numeric
-- reference value.
--
-- The payment method is included so different payment providers
-- can legally use the same reference format.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_wallet_topups_payment_method_normalized_reference
ON public.wallet_topups (
  payment_method_id,
  (
    regexp_replace(
      lower(trim(reference_number)),
      '[^0-9]',
      '',
      'g'
    )
  )
)
WHERE reference_number IS NOT NULL
  AND regexp_replace(
    lower(trim(reference_number)),
    '[^0-9]',
    '',
    'g'
  ) <> '';
