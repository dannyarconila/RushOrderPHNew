REVOKE ALL ON FUNCTION public.handle_application_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_duplicate_application() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
