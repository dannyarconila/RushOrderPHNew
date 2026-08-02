-- Public-facing image buckets: readable by everyone, writable only by the owning user's folder
DROP POLICY IF EXISTS "public_store_media_read" ON storage.objects;
CREATE POLICY "public_store_media_read" ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id IN ('store-logos','store-banners','product-images'));

DROP POLICY IF EXISTS "owner_store_media_insert" ON storage.objects;
CREATE POLICY "owner_store_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('store-logos','store-banners','product-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_store_media_update" ON storage.objects;
CREATE POLICY "owner_store_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('store-logos','store-banners','product-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id IN ('store-logos','store-banners','product-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_store_media_delete" ON storage.objects;
CREATE POLICY "owner_store_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  (bucket_id IN ('store-logos','store-banners','product-images')
    AND (storage.foldername(name))[1] = auth.uid()::text)
  OR (bucket_id IN ('store-logos','store-banners','product-images')
    AND public.has_role(auth.uid(), 'admin'))
);

-- Private per-user buckets
DROP POLICY IF EXISTS "private_media_read" ON storage.objects;
CREATE POLICY "private_media_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('customer-avatars','chat-images'));

DROP POLICY IF EXISTS "private_media_write" ON storage.objects;
CREATE POLICY "private_media_write" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('customer-avatars','chat-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "private_media_update" ON storage.objects;
CREATE POLICY "private_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('customer-avatars','chat-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id IN ('customer-avatars','chat-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "private_media_delete" ON storage.objects;
CREATE POLICY "private_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('customer-avatars','chat-images')
  AND (storage.foldername(name))[1] = auth.uid()::text
);
