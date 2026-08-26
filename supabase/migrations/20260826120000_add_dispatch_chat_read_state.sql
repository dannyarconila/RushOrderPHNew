-- Track the last time each customer/rider opened a dispatch conversation.
-- This keeps message rows immutable and lets unread state work across devices.

CREATE TABLE IF NOT EXISTS public.dispatch_chat_reads (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dispatch_chat_reads_user
  ON public.dispatch_chat_reads (user_id, last_read_at DESC);

ALTER TABLE public.dispatch_chat_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatch_chat_reads_select ON public.dispatch_chat_reads;
CREATE POLICY dispatch_chat_reads_select
ON public.dispatch_chat_reads
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = dispatch_chat_reads.order_id
      AND (
        o.customer_id = auth.uid()
        OR o.rider_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS dispatch_chat_reads_insert ON public.dispatch_chat_reads;
CREATE POLICY dispatch_chat_reads_insert
ON public.dispatch_chat_reads
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = dispatch_chat_reads.order_id
      AND (
        o.customer_id = auth.uid()
        OR o.rider_id = auth.uid()
      )
  )
);

DROP POLICY IF EXISTS dispatch_chat_reads_update ON public.dispatch_chat_reads;
CREATE POLICY dispatch_chat_reads_update
ON public.dispatch_chat_reads
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = dispatch_chat_reads.order_id
      AND (
        o.customer_id = auth.uid()
        OR o.rider_id = auth.uid()
      )
  )
)
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = dispatch_chat_reads.order_id
      AND (
        o.customer_id = auth.uid()
        OR o.rider_id = auth.uid()
      )
  )
);

GRANT SELECT, INSERT, UPDATE
ON public.dispatch_chat_reads
TO authenticated;
