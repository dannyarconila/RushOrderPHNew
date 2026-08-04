-- Repair and harden Supabase Storage provisioning and RLS.
-- This migration is idempotent and safe to re-run.

-- 1) Ensure every required bucket exists and has the intended visibility.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('verification-documents', 'verification-documents', false),
  ('store-logos', 'store-logos', true),
  ('store-banners', 'store-banners', true),
  ('product-images', 'product-images', true),
  ('customer-avatars', 'customer-avatars', false),
  ('chat-images', 'chat-images', false),
  ('payment-proofs', 'payment-proofs', false),
  ('payment-qr', 'payment-qr', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public;

-- 2) Remove legacy policies so final behavior is deterministic.
DROP POLICY IF EXISTS "verification_docs_own_read" ON storage.objects;
DROP POLICY IF EXISTS "verification_docs_own_insert" ON storage.objects;
DROP POLICY IF EXISTS "verification_docs_own_update" ON storage.objects;
DROP POLICY IF EXISTS "verification_docs_own_delete" ON storage.objects;

DROP POLICY IF EXISTS "public_store_media_read" ON storage.objects;
DROP POLICY IF EXISTS "owner_store_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "owner_store_media_update" ON storage.objects;
DROP POLICY IF EXISTS "owner_store_media_delete" ON storage.objects;

DROP POLICY IF EXISTS "private_media_read" ON storage.objects;
DROP POLICY IF EXISTS "private_media_write" ON storage.objects;
DROP POLICY IF EXISTS "private_media_update" ON storage.objects;
DROP POLICY IF EXISTS "private_media_delete" ON storage.objects;

DROP POLICY IF EXISTS "payment_proofs_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "payment_proofs_read_own_or_admin" ON storage.objects;
DROP POLICY IF EXISTS "payment_qr_read_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "payment_qr_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "payment_qr_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "payment_qr_admin_delete" ON storage.objects;

-- 3) Recreate required policies with IF-NOT-EXISTS guards.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'verification_docs_own_read'
  ) THEN
    CREATE POLICY "verification_docs_own_read"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'verification-documents'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'verification_docs_own_insert'
  ) THEN
    CREATE POLICY "verification_docs_own_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'verification-documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'verification_docs_own_update'
  ) THEN
    CREATE POLICY "verification_docs_own_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'verification-documents'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      )
      WITH CHECK (
        bucket_id = 'verification-documents'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'verification_docs_own_delete'
  ) THEN
    CREATE POLICY "verification_docs_own_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'verification-documents'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'public_store_media_read'
  ) THEN
    CREATE POLICY "public_store_media_read"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id IN ('store-logos', 'store-banners', 'product-images'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'owner_store_media_insert'
  ) THEN
    CREATE POLICY "owner_store_media_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id IN ('store-logos', 'store-banners', 'product-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'owner_store_media_update'
  ) THEN
    CREATE POLICY "owner_store_media_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id IN ('store-logos', 'store-banners', 'product-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      )
      WITH CHECK (
        bucket_id IN ('store-logos', 'store-banners', 'product-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'owner_store_media_delete'
  ) THEN
    CREATE POLICY "owner_store_media_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id IN ('store-logos', 'store-banners', 'product-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'private_media_read'
  ) THEN
    CREATE POLICY "private_media_read"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id IN ('customer-avatars', 'chat-images'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'private_media_write'
  ) THEN
    CREATE POLICY "private_media_write"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id IN ('customer-avatars', 'chat-images')
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'private_media_update'
  ) THEN
    CREATE POLICY "private_media_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id IN ('customer-avatars', 'chat-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      )
      WITH CHECK (
        bucket_id IN ('customer-avatars', 'chat-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'private_media_delete'
  ) THEN
    CREATE POLICY "private_media_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id IN ('customer-avatars', 'chat-images')
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'payment_proofs_insert_own'
  ) THEN
    CREATE POLICY "payment_proofs_insert_own"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'payment-proofs'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'payment_proofs_read_own_or_admin'
  ) THEN
    CREATE POLICY "payment_proofs_read_own_or_admin"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'payment-proofs'
        AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR public.has_role(auth.uid(), 'admin')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'payment_qr_read_authenticated'
  ) THEN
    CREATE POLICY "payment_qr_read_authenticated"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'payment-qr');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'payment_qr_admin_insert'
  ) THEN
    CREATE POLICY "payment_qr_admin_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'payment_qr_admin_update'
  ) THEN
    CREATE POLICY "payment_qr_admin_update"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'))
      WITH CHECK (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'payment_qr_admin_delete'
  ) THEN
    CREATE POLICY "payment_qr_admin_delete"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));
  END IF;
END
$$;
