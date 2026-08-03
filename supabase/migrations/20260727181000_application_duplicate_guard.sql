-- This trigger function existed in the original Lovable database but was not
-- included in its exported migration history.
CREATE OR REPLACE FUNCTION public.block_duplicate_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  duplicate_exists boolean;
BEGIN
  IF TG_TABLE_NAME = 'seller_applications' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.seller_applications
      WHERE user_id = NEW.user_id AND status IN ('pending', 'under_review', 'approved')
    ) INTO duplicate_exists;
  ELSIF TG_TABLE_NAME = 'rider_applications' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.rider_applications
      WHERE user_id = NEW.user_id AND status IN ('pending', 'under_review', 'approved')
    ) INTO duplicate_exists;
  ELSE
    RAISE EXCEPTION 'Unsupported application table: %', TG_TABLE_NAME;
  END IF;

  IF duplicate_exists THEN
    RAISE EXCEPTION 'An active application already exists.';
  END IF;
  RETURN NEW;
END;
$$;
