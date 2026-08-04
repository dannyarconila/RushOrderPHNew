-- In-app chat for standalone Pasugo bookings.

CREATE TABLE IF NOT EXISTS public.pasugo_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.pasugo_bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pasugo_chat_booking_created ON public.pasugo_chat_messages (booking_id, created_at);

GRANT SELECT, INSERT ON public.pasugo_chat_messages TO authenticated;
GRANT ALL ON public.pasugo_chat_messages TO service_role;

ALTER TABLE public.pasugo_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pasugo_chat_read ON public.pasugo_chat_messages;
CREATE POLICY pasugo_chat_read ON public.pasugo_chat_messages
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1
    FROM public.pasugo_bookings b
    WHERE b.id = pasugo_chat_messages.booking_id
      AND auth.uid() IN (b.customer_id, b.assigned_rider_id)
  )
);

DROP POLICY IF EXISTS pasugo_chat_insert ON public.pasugo_chat_messages;
CREATE POLICY pasugo_chat_insert ON public.pasugo_chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND recipient_id <> auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.pasugo_bookings b
    WHERE b.id = pasugo_chat_messages.booking_id
      AND b.assigned_rider_id IS NOT NULL
      AND sender_id IN (b.customer_id, b.assigned_rider_id)
      AND recipient_id IN (b.customer_id, b.assigned_rider_id)
  )
);

ALTER TABLE public.pasugo_chat_messages REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.pasugo_chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
