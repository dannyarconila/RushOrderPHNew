-- Pasugo chat is private in-app communication.
-- Do not create notification-bell or push-notification entries
-- for Pasugo chat messages.

DROP TRIGGER IF EXISTS pasugo_chat_message_notification
ON public.pasugo_chat_messages;

DROP FUNCTION IF EXISTS public.notify_pasugo_chat_recipient();
