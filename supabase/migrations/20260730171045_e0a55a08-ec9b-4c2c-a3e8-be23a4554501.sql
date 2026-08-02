-- payment proofs: owner folder = auth.uid()
CREATE POLICY "payment_proofs_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "payment_proofs_read_own_or_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs'
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'admin')));

-- payment QR codes: readable by any signed-in user, writable by admins only
CREATE POLICY "payment_qr_read_authenticated" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'payment-qr');

CREATE POLICY "payment_qr_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "payment_qr_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "payment_qr_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'payment-qr' AND public.has_role(auth.uid(), 'admin'));