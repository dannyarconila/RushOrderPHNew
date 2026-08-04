-- In-app chat between customer (booker) and assigned rider per order.
-- Messages are only visible to participants (or admin), and sending is allowed
-- only after a rider has been assigned.

CREATE TABLE IF NOT EXISTS public.dispatch_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_chat_order_created
  ON public.dispatch_chat_messages (order_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dispatch_chat_sender_created
  ON public.dispatch_chat_messages (sender_id, created_at);

GRANT SELECT, INSERT ON public.dispatch_chat_messages TO authenticated;
GRANT ALL ON public.dispatch_chat_messages TO service_role;

ALTER TABLE public.dispatch_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dispatch_chat_messages_read ON public.dispatch_chat_messages;
CREATE POLICY dispatch_chat_messages_read ON public.dispatch_chat_messages
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = dispatch_chat_messages.order_id
      AND auth.uid() IN (o.customer_id, o.rider_id)
  )
);

DROP POLICY IF EXISTS dispatch_chat_messages_insert ON public.dispatch_chat_messages;
CREATE POLICY dispatch_chat_messages_insert ON public.dispatch_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND recipient_id <> auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = dispatch_chat_messages.order_id
      AND o.rider_id IS NOT NULL
      AND sender_id IN (o.customer_id, o.rider_id)
      AND recipient_id IN (o.customer_id, o.rider_id)
  )
);

ALTER TABLE public.dispatch_chat_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dispatch_chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
