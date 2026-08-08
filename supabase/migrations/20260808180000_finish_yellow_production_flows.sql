-- Finish the remaining non-payment production gaps:
-- 1) reliable background dispatch retry
-- 2) application duplicate protection by client IP
-- 3) server-enforced delivered-order reviews + store rating rollup
-- 4) realtime support for reviews
--
-- Payment/GCash/payout/refund provider work is intentionally excluded.

/* ------------------------------------------------------------------ */
/* 1. Background dispatch retry                                       */
/* ------------------------------------------------------------------ */
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Keep exactly one scheduler entry for the dispatch retry worker.
DO $$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'rushorder-dispatch-retry'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'rushorder-dispatch-retry',
    '* * * * *',
    $job$SELECT public.retry_expired_dispatches(100);$job$
  );
END $$;

/* ------------------------------------------------------------------ */
/* 2. Application duplicate protection by IP                          */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.request_client_ip()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    btrim(split_part(
      COALESCE(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        current_setting('request.headers', true)::json->>'x-real-ip',
        ''
      ),
      ',',
      1
    )),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.block_duplicate_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  duplicate_exists boolean := false;
  client_ip text := public.request_client_ip();
BEGIN
  -- Serialize submissions from the same address so two simultaneous
  -- requests cannot both pass the duplicate check.
  IF client_ip IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_NAME || ':' || client_ip));
    NEW.ip_address := client_ip;
  END IF;

  IF TG_TABLE_NAME = 'seller_applications' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.seller_applications
      WHERE status IN ('pending', 'under_review')
        AND (user_id = NEW.user_id OR (NEW.ip_address IS NOT NULL AND ip_address = NEW.ip_address))
    ) INTO duplicate_exists;
  ELSIF TG_TABLE_NAME = 'rider_applications' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.rider_applications
      WHERE status IN ('pending', 'under_review')
        AND (user_id = NEW.user_id OR (NEW.ip_address IS NOT NULL AND ip_address = NEW.ip_address))
    ) INTO duplicate_exists;
  ELSE
    RAISE EXCEPTION 'Unsupported application table: %', TG_TABLE_NAME;
  END IF;

  IF duplicate_exists THEN
    RAISE EXCEPTION 'An active application already exists for this account or network address.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seller_application_duplicate ON public.seller_applications;
CREATE TRIGGER trg_seller_application_duplicate
BEFORE INSERT ON public.seller_applications
FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_application();

DROP TRIGGER IF EXISTS trg_rider_application_duplicate ON public.rider_applications;
CREATE TRIGGER trg_rider_application_duplicate
BEFORE INSERT ON public.rider_applications
FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_application();

/* ------------------------------------------------------------------ */
/* 3. Reviews: only verified delivered orders may be reviewed         */
/* ------------------------------------------------------------------ */
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_customer_order
  ON public.reviews (user_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reviews_store_created_idx
  ON public.reviews (store_id, created_at DESC)
  WHERE store_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_review_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
BEGIN
  IF public.is_portal_admin() OR current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'You may only edit your own review.';
    END IF;
    NEW.user_id := OLD.user_id;
    NEW.order_id := OLD.order_id;
    NEW.store_id := OLD.store_id;
    NEW.product_id := OLD.product_id;
  ELSIF NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You may only submit reviews for your own account.';
  END IF;

  IF NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'A delivered order is required before submitting a review.';
  END IF;

  SELECT * INTO o
  FROM public.orders
  WHERE id = NEW.order_id
    AND customer_id = auth.uid()
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not owned by this customer.';
  END IF;

  IF o.status <> 'delivered' THEN
    RAISE EXCEPTION 'You can review an order only after it is delivered.';
  END IF;

  IF o.store_id IS NULL THEN
    RAISE EXCEPTION 'This order is not eligible for a store review.';
  END IF;

  NEW.store_id := o.store_id;
  NEW.rating := LEAST(GREATEST(COALESCE(NEW.rating, 5), 1), 5);
  NEW.comment := NULLIF(BTRIM(COALESCE(NEW.comment, '')), '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_guard_submission ON public.reviews;
CREATE TRIGGER trg_reviews_guard_submission
BEFORE INSERT OR UPDATE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.guard_review_submission();

-- Keep store rating aggregates authoritative and server-owned.
CREATE OR REPLACE FUNCTION public.refresh_store_rating(_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_rating numeric;
  count_rating integer;
BEGIN
  SELECT COALESCE(AVG(rating), 0), COUNT(*)::integer
    INTO avg_rating, count_rating
  FROM public.reviews
  WHERE store_id = _store_id;

  UPDATE public.stores
  SET rating = ROUND(avg_rating, 2),
      rating_count = count_rating,
      updated_at = now()
  WHERE id = _store_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_store_rating_from_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.store_id IS NOT NULL THEN
      PERFORM public.refresh_store_rating(OLD.store_id);
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.store_id IS NOT NULL THEN
    PERFORM public.refresh_store_rating(NEW.store_id);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.store_id IS NOT NULL AND OLD.store_id IS DISTINCT FROM NEW.store_id THEN
    PERFORM public.refresh_store_rating(OLD.store_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_sync_store_rating ON public.reviews;
CREATE TRIGGER trg_reviews_sync_store_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.sync_store_rating_from_review();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.reviews;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill any existing store ratings from the review table.
UPDATE public.stores s
SET rating = x.avg_rating,
    rating_count = x.review_count,
    updated_at = now()
FROM (
  SELECT store_id,
         ROUND(AVG(rating), 2) AS avg_rating,
         COUNT(*)::integer AS review_count
  FROM public.reviews
  WHERE store_id IS NOT NULL
  GROUP BY store_id
) x
WHERE s.id = x.store_id;

UPDATE public.stores s
SET rating = 0,
    rating_count = 0,
    updated_at = now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.reviews r WHERE r.store_id = s.id
)
AND (s.rating <> 0 OR s.rating_count <> 0);

/* ------------------------------------------------------------------ */
/* 5. Google/OAuth customer legal acceptance                          */
/* ------------------------------------------------------------------ */
CREATE OR REPLACE FUNCTION public.accept_customer_legal(
  _terms_version text,
  _privacy_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  UPDATE public.profiles
  SET accepted_terms = true,
      accepted_terms_at = now(),
      terms_version = COALESCE(NULLIF(_terms_version, ''), '1.0.0'),
      privacy_version = COALESCE(NULLIF(_privacy_version, ''), '1.0.0'),
      updated_at = now()
  WHERE id = uid;

  INSERT INTO public.legal_acceptance_logs (
    user_id, audience, terms_version, privacy_version, source, metadata, accepted_at
  ) VALUES (
    uid,
    'customer',
    COALESCE(NULLIF(_terms_version, ''), '1.0.0'),
    COALESCE(NULLIF(_privacy_version, ''), '1.0.0'),
    'google_oauth',
    jsonb_build_object('provider', 'google'),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_customer_legal(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_customer_legal(text, text) TO authenticated;
