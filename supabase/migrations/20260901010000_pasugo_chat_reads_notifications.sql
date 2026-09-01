-- Pasugo keeps its own read state, scoped to booking_id rather than Marketplace
-- orders. The message trigger provides the existing notification centre with a
-- realtime in-app message notification for the receiving participant.
CREATE TABLE IF NOT EXISTS public.pasugo_chat_reads (
  booking_id uuid NOT NULL REFERENCES public.pasugo_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pasugo_chat_reads_user
  ON public.pasugo_chat_reads (user_id, last_read_at DESC);

ALTER TABLE public.pasugo_chat_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY pasugo_chat_reads_select ON public.pasugo_chat_reads
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pasugo_bookings b
    WHERE b.id = pasugo_chat_reads.booking_id
      AND auth.uid() IN (b.customer_id, b.assigned_rider_id)
  )
);

CREATE POLICY pasugo_chat_reads_insert ON public.pasugo_chat_reads
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.pasugo_bookings b
    WHERE b.id = pasugo_chat_reads.booking_id
      AND auth.uid() IN (b.customer_id, b.assigned_rider_id)
  )
);

CREATE POLICY pasugo_chat_reads_update ON public.pasugo_chat_reads
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.pasugo_chat_reads TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_pasugo_chat_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (
    NEW.recipient_id,
    'New Pasugo message',
    LEFT(NEW.message, 160),
    'pasugo_chat'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pasugo_chat_message_notification ON public.pasugo_chat_messages;
CREATE TRIGGER pasugo_chat_message_notification
AFTER INSERT ON public.pasugo_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_pasugo_chat_recipient();
