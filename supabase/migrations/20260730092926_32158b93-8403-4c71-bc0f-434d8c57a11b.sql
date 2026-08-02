REVOKE SELECT ON public.payment_providers FROM anon, authenticated;
GRANT SELECT (id, code, name, is_enabled, supports_qr, supports_redirect, sort_order, created_at, updated_at)
  ON public.payment_providers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;

DROP POLICY IF EXISTS private_media_read ON storage.objects;
CREATE POLICY private_media_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = ANY (ARRAY['customer-avatars'::text, 'chat-images'::text])
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);