
REVOKE SELECT ON public.payment_methods FROM anon;

DROP POLICY IF EXISTS payment_methods_public_read_active ON public.payment_methods;
CREATE POLICY payment_methods_read_active
ON public.payment_methods
FOR SELECT
TO authenticated
USING (is_active = true);
