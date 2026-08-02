DROP POLICY "orders_update" ON public.orders;
CREATE POLICY "orders_update" ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = customer_id OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()))
  WITH CHECK (auth.uid() = customer_id OR public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));

REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;