
-- Persistent, one-way bootstrap flag
INSERT INTO public.system_settings (key, value, description, is_public)
VALUES (
  'admin_bootstrap_completed',
  to_jsonb(EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')),
  'One-way flag: true once the first administrator has been claimed. Bootstrap can never run again.',
  false
)
ON CONFLICT (key) DO NOTHING;

-- Public read-only check: is bootstrap still available?
CREATE OR REPLACE FUNCTION public.admin_bootstrap_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT (value)::text::boolean FROM public.system_settings WHERE key = 'admin_bootstrap_completed'), false) = false
     AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');
$$;

-- One-time claim: grants the CALLER the admin role, only while no admin exists.
CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_done boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to claim the administrator role.';
  END IF;

  -- Serialize concurrent claims
  LOCK TABLE public.user_roles IN SHARE ROW EXCLUSIVE MODE;

  SELECT COALESCE((value)::text::boolean, false) INTO v_done
  FROM public.system_settings WHERE key = 'admin_bootstrap_completed';

  IF COALESCE(v_done, false) OR EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Administrator bootstrap is already complete.';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  UPDATE public.system_settings
     SET value = to_jsonb(true), updated_at = now()
   WHERE key = 'admin_bootstrap_completed';

  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, after_data)
  VALUES (v_uid, 'admin_bootstrap_claimed', 'user_roles', v_uid, jsonb_build_object('role', 'admin'));

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bootstrap_available() FROM public;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_bootstrap_available() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO authenticated, service_role;
