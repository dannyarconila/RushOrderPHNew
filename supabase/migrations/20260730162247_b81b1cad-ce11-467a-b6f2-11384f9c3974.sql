-- 1. Account moderation fields on profiles
DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('active', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status public.account_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_note text,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- 2. Admins may moderate any profile; members keep own-profile updates but
--    cannot change their own moderation status.
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_profile_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.account_status := OLD.account_status;
    NEW.status_note := OLD.status_note;
    NEW.status_changed_at := OLD.status_changed_at;
  ELSIF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
    NEW.status_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_profile_status() FROM public;

DROP TRIGGER IF EXISTS trg_profiles_guard_status ON public.profiles;
CREATE TRIGGER trg_profiles_guard_status
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_status();

-- 3. Admins can send announcements / notifications to any member
DROP POLICY IF EXISTS notifications_admin_insert ON public.notifications;
CREATE POLICY notifications_admin_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS notifications_admin_read ON public.notifications;
CREATE POLICY notifications_admin_read ON public.notifications
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

GRANT INSERT ON public.notifications TO authenticated;