-- Allow assigned riders to read their own orders.
-- Needed for rider booking chat metadata queries.

DROP POLICY IF EXISTS "orders_customer" ON public.orders;
CREATE POLICY "orders_customer" ON public.orders FOR SELECT TO authenticated
USING (
  auth.uid() = customer_id
  OR auth.uid() = rider_id
  OR public.has_role(auth.uid(),'admin')
  OR EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()
  )
);
