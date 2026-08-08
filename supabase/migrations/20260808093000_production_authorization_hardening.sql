-- Production authorization hardening for application reviews, order workflow,
-- dispatch control, and admin bootstrap.

-- Disable the legacy public bootstrap path. Internal admin accounts now use the
-- isolated admin_accounts flow and env-driven bootstrap on the trusted server.
CREATE OR REPLACE FUNCTION public.admin_bootstrap_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT false;
$$;
REVOKE ALL ON FUNCTION public.admin_bootstrap_available() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_bootstrap_available() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_first_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Legacy public admin bootstrap is disabled. Provision an internal admin through the trusted server bootstrap flow.';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_first_admin() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin() TO service_role;

-- Disable the repository-seeded internal admin account if it has never been
-- activated. Existing real admin accounts are left untouched.
UPDATE public.admin_accounts
SET is_active = false,
    locked_until = now(),
    updated_at = now()
WHERE username = 'RushOrderAdmin'
  AND created_by IS NULL
  AND must_change_credentials = true
  AND last_login_at IS NULL;

-- Admin reviews of seller/rider applications must run through a single
-- privileged database function so approval side effects remain transactional.
CREATE OR REPLACE FUNCTION public.admin_portal_review_application(
  _kind text,
  _application_id uuid,
  _next_status public.application_status,
  _notes text DEFAULT NULL,
  _approval_bonus numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seller_row public.seller_applications%ROWTYPE;
  rider_row public.rider_applications%ROWTYPE;
  normalized_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
  previous_status public.application_status;
  target_user_id uuid;
  target_wallet public.wallet_type;
  configured_bonus numeric := 0;
  approval_bonus numeric := 0;
  wallet_row public.wallets%ROWTYPE;
  previous_balance numeric := 0;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION 'Service role required.';
  END IF;

  IF _kind NOT IN ('seller', 'rider') THEN
    RAISE EXCEPTION 'Unsupported application kind: %', _kind;
  END IF;

  PERFORM set_config('app.portal_admin', 'on', true);

  IF _kind = 'seller' THEN
    SELECT * INTO seller_row
    FROM public.seller_applications
    WHERE id = _application_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Seller application not found.';
    END IF;

    previous_status := seller_row.status;
    target_user_id := seller_row.user_id;
    target_wallet := 'seller';
  ELSE
    SELECT * INTO rider_row
    FROM public.rider_applications
    WHERE id = _application_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rider application not found.';
    END IF;

    previous_status := rider_row.status;
    target_user_id := rider_row.user_id;
    target_wallet := 'rider';
  END IF;

  IF previous_status IN ('approved', 'rejected') AND _next_status <> previous_status THEN
    RAISE EXCEPTION 'Reviewed applications cannot be reopened. Ask the applicant to submit a new application instead.';
  END IF;

  IF _next_status = 'under_review' AND previous_status <> 'pending' THEN
    RAISE EXCEPTION 'Only pending applications can move to under review.';
  END IF;

  IF _next_status = 'pending' AND previous_status <> 'under_review' THEN
    RAISE EXCEPTION 'Only under-review applications can move back to pending.';
  END IF;

  IF _next_status = 'approved' AND previous_status NOT IN ('pending', 'under_review') THEN
    RAISE EXCEPTION 'Only pending or under-review applications can be approved.';
  END IF;

  IF _next_status = 'rejected' THEN
    IF previous_status NOT IN ('pending', 'under_review') THEN
      RAISE EXCEPTION 'Only pending or under-review applications can be rejected.';
    END IF;
    IF normalized_notes IS NULL THEN
      RAISE EXCEPTION 'A rejection reason is required.';
    END IF;
  END IF;

  IF previous_status = _next_status THEN
    RETURN jsonb_build_object(
      'changed', false,
      'user_id', target_user_id,
      'old_status', previous_status,
      'new_status', _next_status,
      'wallet_bonus', 0
    );
  END IF;

  IF _kind = 'seller' THEN
    UPDATE public.seller_applications
    SET status = _next_status,
        review_notes = normalized_notes,
        reviewed_at = CASE WHEN _next_status IN ('approved', 'rejected') THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = _application_id;
  ELSE
    UPDATE public.rider_applications
    SET status = _next_status,
        review_notes = normalized_notes,
        reviewed_at = CASE WHEN _next_status IN ('approved', 'rejected') THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = _application_id;
  END IF;

  IF _next_status = 'approved' THEN
    SELECT COALESCE((value)::numeric, 0)
    INTO configured_bonus
    FROM public.system_settings
    WHERE key = 'welcome_wallet_bonus';

    approval_bonus := GREATEST(COALESCE(_approval_bonus, configured_bonus, 0), 0);

    IF approval_bonus > 0 THEN
      SELECT * INTO wallet_row
      FROM public.wallets
      WHERE user_id = target_user_id
        AND wallet_type = target_wallet
        AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Approval provisioning did not create the required % wallet.', target_wallet;
      END IF;

      previous_balance := COALESCE(wallet_row.balance, 0);

      UPDATE public.wallets
      SET balance = previous_balance + approval_bonus,
          updated_at = now()
      WHERE id = wallet_row.id;

      INSERT INTO public.wallet_transactions (
        wallet_id,
        amount,
        kind,
        previous_balance,
        new_balance,
        status,
        description
      )
      VALUES (
        wallet_row.id,
        approval_bonus,
        'welcome',
        previous_balance,
        previous_balance + approval_bonus,
        'succeeded',
        'Welcome Credit'
      );

      INSERT INTO public.notifications (user_id, title, body, kind)
      VALUES (
        target_user_id,
        'Welcome Credit',
        'A welcome credit of PHP ' || to_char(approval_bonus, 'FM999999990.00') || ' has been added to your wallet.',
        'wallet'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'changed', true,
    'user_id', target_user_id,
    'old_status', previous_status,
    'new_status', _next_status,
    'wallet_bonus', approval_bonus
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_portal_review_application(text, uuid, public.application_status, text, numeric) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_portal_review_application(text, uuid, public.application_status, text, numeric) TO service_role;

-- Secure order transition entry point for customer and seller workflow.
CREATE OR REPLACE FUNCTION public.transition_order_status(
  _order_id uuid,
  _next_status public.order_status
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  order_row public.orders%ROWTYPE;
  is_store_owner boolean := false;
BEGIN
  SELECT * INTO order_row
  FROM public.orders
  WHERE id = _order_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF public.is_portal_admin() OR public.has_role(uid, 'admin') OR current_user IN ('service_role', 'postgres') THEN
    UPDATE public.orders
    SET status = _next_status,
        updated_at = now()
    WHERE id = order_row.id;
    RETURN true;
  END IF;

  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  is_store_owner := EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.id = order_row.store_id
      AND s.owner_id = uid
  );

  IF uid = order_row.customer_id THEN
    IF NOT (order_row.status = 'pending' AND _next_status = 'cancelled') THEN
      RAISE EXCEPTION 'Customers may only cancel pending orders.';
    END IF;
  ELSIF is_store_owner THEN
    IF NOT (
      (order_row.status = 'pending' AND _next_status IN ('confirmed', 'cancelled'))
      OR (order_row.status = 'confirmed' AND _next_status IN ('preparing', 'cancelled'))
      OR (order_row.status = 'preparing' AND _next_status IN ('ready', 'cancelled'))
      OR (order_row.status = 'ready' AND _next_status = 'cancelled')
    ) THEN
      RAISE EXCEPTION 'Invalid seller order transition.';
    END IF;
  ELSE
    RAISE EXCEPTION 'You are not authorized to change this order.';
  END IF;

  UPDATE public.orders
  SET status = _next_status,
      updated_at = now()
  WHERE id = order_row.id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.transition_order_status(uuid, public.order_status) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, public.order_status) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_broadcast(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  timeout_s integer := COALESCE((s->>'dispatch_timeout_seconds')::int, 30);
  strategy text := COALESCE(s->>'dispatch_strategy', 'nearest_first');
  sent integer := 0;
  r record;
  cap integer;
  rider_title text;
  rider_body text;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN 0; END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.is_portal_admin()
    OR public.has_role(uid, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.stores st
      JOIN public.orders o ON o.store_id = st.id
      WHERE st.id = j.store_id
        AND st.owner_id = uid
        AND o.id = j.order_id
        AND o.status = 'ready'
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to broadcast this dispatch job.';
  END IF;

  cap := CASE strategy WHEN 'nearest_first' THEN 1 WHEN 'wave' THEN 3 ELSE 50 END;

  FOR r IN
    SELECT rs.user_id,
           public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) AS dist
      FROM public.rider_status rs
      JOIN public.user_roles ur ON ur.user_id = rs.user_id AND ur.role = 'rider'
      JOIN public.profiles p ON p.id = rs.user_id
      JOIN public.wallets w ON w.user_id = rs.user_id AND w.wallet_type = 'rider' AND w.deleted_at IS NULL
     WHERE rs.is_online AND rs.is_available
       AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
       AND p.account_status = 'active'
       AND (
         public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) IS NULL
         OR public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) <= j.radius_km
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.dispatch_offers o
          WHERE o.job_id = j.id AND o.rider_id = rs.user_id AND o.status = 'declined'
       )
     ORDER BY dist NULLS LAST, rs.last_seen_at DESC
     LIMIT cap
  LOOP
    INSERT INTO public.dispatch_offers (job_id, order_id, rider_id, attempt, distance_km, expires_at)
    VALUES (j.id, j.order_id, r.user_id, j.attempt, r.dist, now() + make_interval(secs => timeout_s))
    ON CONFLICT (job_id, rider_id, attempt) DO NOTHING;

    IF FOUND THEN
      sent := sent + 1;
      rider_title := CASE WHEN j.dispatch_type = 'pasugo' THEN 'New Pasugo booking' ELSE 'New delivery request' END;
      rider_body := CASE
        WHEN j.dispatch_type = 'pasugo'
          THEN 'A nearby customer needs errand help — PHP ' || to_char(j.delivery_fee, 'FM999999990.00')
        ELSE COALESCE(j.store_name, 'A store') || ' needs a rider — PHP ' || to_char(j.delivery_fee, 'FM999999990.00')
      END;
      INSERT INTO public.notifications (user_id, title, body, kind)
      VALUES (r.user_id, rider_title, rider_body, 'dispatch');
    END IF;
  END LOOP;

  UPDATE public.dispatch_jobs
     SET expires_at = now() + make_interval(secs => timeout_s), last_attempt_at = now(), updated_at = now()
   WHERE id = j.id;

  RETURN sent;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_broadcast(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_broadcast(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_start(_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.orders%ROWTYPE;
  st public.stores%ROWTYPE;
  ad public.addresses%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  dist numeric;
  fee numeric;
  job_id uuid;
  pickup text;
  dropoff text;
  job_dispatch_type text := 'marketplace';
  job_customer_notes text := NULL;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR o.status = 'cancelled' OR o.deleted_at IS NOT NULL THEN RETURN NULL; END IF;
  IF o.status <> 'ready' THEN
    RAISE EXCEPTION 'Dispatch can only start when the order is ready.';
  END IF;

  SELECT * INTO st FROM public.stores WHERE id = o.store_id;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.is_portal_admin()
    OR public.has_role(uid, 'admin')
    OR (uid IS NOT NULL AND st.owner_id = uid)
  ) THEN
    RAISE EXCEPTION 'You are not authorized to start dispatch for this order.';
  END IF;

  IF o.address_id IS NOT NULL THEN SELECT * INTO ad FROM public.addresses WHERE id = o.address_id; END IF;

  dist := COALESCE(
    public.haversine_km(st.latitude, st.longitude, ad.latitude, ad.longitude),
    NULLIF(o.distance_km, 0),
    0
  );
  fee := GREATEST(
    COALESCE((s->>'dispatch_min_fee')::numeric, 49),
    LEAST(COALESCE((s->>'dispatch_max_fee')::numeric, 300),
          round(dist * COALESCE((s->>'dispatch_fee_per_km')::numeric, 15), 2))
  );

  pickup := COALESCE(NULLIF(btrim(concat_ws(', ', st.address->>'line1', st.address->>'barangay', st.address->>'city')), ''), st.name);
  dropoff := COALESCE(NULLIF(btrim(concat_ws(', ', ad.line1, ad.barangay, ad.city)), ''), 'Customer address');

  IF COALESCE(o.notes, '') LIKE '[PASUGO]%' THEN
    job_dispatch_type := 'pasugo';
    job_customer_notes := NULLIF(split_part(regexp_replace(o.notes, '^\\[PASUGO\\]\\s*', ''), E'\n', 1), '');
  END IF;

  INSERT INTO public.dispatch_jobs (
    order_id, store_id, status, radius_km, attempt, max_attempts, distance_km, delivery_fee,
    store_name, pickup_address, dropoff_address, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
    dispatch_type, customer_notes
  ) VALUES (
    _order_id, o.store_id, 'searching',
    COALESCE((s->>'dispatch_radius_km')::numeric, 5), 1,
    COALESCE((s->>'dispatch_max_retries')::int, 5),
    dist, fee, st.name, pickup, dropoff, st.latitude, st.longitude, ad.latitude, ad.longitude,
    job_dispatch_type, job_customer_notes
  )
  ON CONFLICT (order_id) DO UPDATE
    SET status = CASE WHEN public.dispatch_jobs.status IN ('cancelled','failed') THEN 'searching' ELSE public.dispatch_jobs.status END,
        dispatch_type = EXCLUDED.dispatch_type,
        customer_notes = EXCLUDED.customer_notes,
        updated_at = now()
  RETURNING id INTO job_id;

  PERFORM public.dispatch_broadcast(job_id);

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (
    o.customer_id,
    CASE WHEN job_dispatch_type = 'pasugo' THEN 'Finding a rider' ELSE 'Searching for a rider' END,
    CASE WHEN job_dispatch_type = 'pasugo'
      THEN 'We are searching for nearby riders for your Pasugo booking.'
      ELSE 'Your order is ready and we are finding a nearby rider.'
    END,
    'dispatch'
  );

  RETURN job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_start(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_start(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_retry(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  next_radius numeric;
BEGIN
  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN false; END IF;
  IF j.expires_at IS NOT NULL AND j.expires_at > now() THEN RETURN false; END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.is_portal_admin()
    OR public.has_role(uid, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.stores st
      JOIN public.orders o ON o.store_id = st.id
      WHERE st.id = j.store_id
        AND st.owner_id = uid
        AND o.id = j.order_id
        AND o.status = 'ready'
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to retry this dispatch job.';
  END IF;

  UPDATE public.dispatch_offers SET status = 'expired', updated_at = now()
   WHERE job_id = j.id AND status = 'pending' AND expires_at <= now();

  IF j.attempt >= COALESCE(j.max_attempts, 5) THEN
    UPDATE public.dispatch_jobs SET status = 'failed', updated_at = now() WHERE id = j.id;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT st.owner_id, 'No rider available', 'We could not find a rider for order ' || COALESCE(o.claim_number, left(o.id::text, 8)) || '.', 'dispatch'
      FROM public.orders o JOIN public.stores st ON st.id = o.store_id WHERE o.id = j.order_id;
    RETURN false;
  END IF;

  next_radius := j.radius_km;
  IF COALESCE((s->>'dispatch_auto_expand')::boolean, true) THEN
    next_radius := LEAST(
      COALESCE((s->>'dispatch_max_radius_km')::numeric, 10),
      j.radius_km + COALESCE((s->>'dispatch_radius_expansion_km')::numeric, 2)
    );
  END IF;

  UPDATE public.dispatch_jobs
     SET attempt = j.attempt + 1, radius_km = next_radius, updated_at = now()
   WHERE id = j.id;

  PERFORM public.dispatch_broadcast(j.id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_retry(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_retry(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  o public.orders%ROWTYPE;
  required_balance numeric;
  current_balance numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF NOT public.has_role(uid, 'rider') THEN RAISE EXCEPTION 'Only approved riders can accept deliveries.'; END IF;

  required_balance := public.minimum_wallet_balance_for_role('rider');
  SELECT balance INTO current_balance
  FROM public.wallets
  WHERE user_id = uid
    AND wallet_type = 'rider'
    AND deleted_at IS NULL
  LIMIT 1;

  IF current_balance IS NULL OR current_balance < required_balance THEN
    RAISE EXCEPTION 'Your rider wallet balance must be at least ₱% to accept bookings.', required_balance;
  END IF;

  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  SELECT * INTO o FROM public.orders WHERE id = j.order_id FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL OR o.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.dispatch_offers
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching' OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  UPDATE public.dispatch_jobs
     SET status = 'assigned', assigned_rider_id = uid, assigned_at = now(), expires_at = NULL, updated_at = now()
   WHERE id = j.id;

  UPDATE public.dispatch_offers SET status = 'accepted', responded_at = now()
   WHERE job_id = j.id AND rider_id = uid;
  UPDATE public.dispatch_offers SET status = 'cancelled', responded_at = now()
   WHERE job_id = j.id AND rider_id <> uid AND status = 'pending';

  UPDATE public.rider_status
     SET is_available = false, active_order_id = j.order_id, updated_at = now()
   WHERE user_id = uid;

  UPDATE public.orders SET rider_id = uid, updated_at = now() WHERE id = j.order_id;

  INSERT INTO public.deliveries (order_id, rider_id, status, pickup_address, dropoff_address, fee, distance_km, claim_number, accepted_at)
  VALUES (j.order_id, uid, 'assigned',
          jsonb_build_object('text', j.pickup_address), jsonb_build_object('text', j.dropoff_address),
          j.delivery_fee, j.distance_km, o.claim_number, now())
  ON CONFLICT (order_id) DO UPDATE
     SET rider_id = EXCLUDED.rider_id, status = 'assigned', accepted_at = now(), updated_at = now();

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (o.customer_id, 'Rider assigned', 'A rider is on the way to pick up your order.', 'dispatch');
  INSERT INTO public.notifications (user_id, title, body, kind)
  SELECT st.owner_id, 'Rider assigned', 'A rider accepted the delivery for order ' || COALESCE(o.claim_number, left(o.id::text, 8)) || '.', 'dispatch'
    FROM public.stores st WHERE st.id = j.store_id;

  RETURN jsonb_build_object('ok', true, 'order_id', j.order_id);
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_accept(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_accept(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_decline(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  UPDATE public.dispatch_offers
  SET status = 'declined', responded_at = now(), updated_at = now()
  WHERE job_id = _job_id
    AND rider_id = uid
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This delivery offer is not pending for you.';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_decline(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_decline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dispatch_advance(_job_id uuid, _step text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  o public.orders%ROWTYPE;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Sign in required.';
  END IF;

  SELECT * INTO j FROM public.dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch job not found.';
  END IF;

  IF j.assigned_rider_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'This delivery is not assigned to you.';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = j.order_id FOR UPDATE;
  IF NOT FOUND OR o.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF _step = 'picked_up' THEN
    IF j.status <> 'assigned' OR o.status <> 'ready' THEN
      RAISE EXCEPTION 'This delivery cannot be marked as picked up yet.';
    END IF;

    UPDATE public.dispatch_jobs SET status = 'picked_up', picked_up_at = now(), updated_at = now() WHERE id = j.id;
    UPDATE public.orders SET status = 'picked_up', updated_at = now() WHERE id = j.order_id;
    UPDATE public.deliveries SET status = 'picked_up', updated_at = now() WHERE order_id = j.order_id;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT ord.customer_id, 'On the way', 'Your rider has picked up your order.', 'dispatch'
      FROM public.orders ord WHERE ord.id = j.order_id;
  ELSIF _step = 'delivered' THEN
    IF j.status <> 'picked_up' OR o.status <> 'picked_up' THEN
      RAISE EXCEPTION 'This delivery cannot be marked as delivered yet.';
    END IF;

    UPDATE public.dispatch_jobs SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE id = j.id;
    UPDATE public.orders SET status = 'delivered', updated_at = now() WHERE id = j.order_id;
    UPDATE public.deliveries SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE order_id = j.order_id;
    UPDATE public.rider_status SET is_available = true, active_order_id = NULL, updated_at = now() WHERE user_id = uid;
    INSERT INTO public.notifications (user_id, title, body, kind)
    SELECT ord.customer_id, 'Delivered', 'Your order has been delivered. Enjoy!', 'dispatch'
      FROM public.orders ord WHERE ord.id = j.order_id;
  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.dispatch_advance(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dispatch_advance(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_start(_booking_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  dist numeric;
  fee numeric;
  job_id uuid;
BEGIN
  SELECT * INTO b FROM public.pasugo_bookings WHERE id = _booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.has_role(uid, 'admin')
    OR uid = b.customer_id
  ) THEN
    RAISE EXCEPTION 'You are not allowed to start this booking.';
  END IF;

  IF b.status IN ('cancelled', 'completed') THEN
    RETURN NULL;
  END IF;

  dist := COALESCE(
    public.haversine_km(b.pickup_lat, b.pickup_lng, b.dropoff_lat, b.dropoff_lng),
    NULLIF(b.estimated_distance_km, 0),
    0
  );

  fee := GREATEST(
    COALESCE((s->>'dispatch_min_fee')::numeric, 49),
    LEAST(
      COALESCE((s->>'dispatch_max_fee')::numeric, 300),
      round(dist * COALESCE((s->>'dispatch_fee_per_km')::numeric, 15), 2)
    )
  );

  INSERT INTO public.pasugo_dispatch_jobs (
    booking_id,
    status,
    radius_km,
    attempt,
    max_attempts,
    distance_km,
    delivery_fee,
    pickup_address,
    dropoff_address,
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng
  ) VALUES (
    b.id,
    'searching',
    COALESCE((s->>'dispatch_radius_km')::numeric, 5),
    1,
    COALESCE((s->>'dispatch_max_retries')::int, 5),
    dist,
    fee,
    b.pickup_address,
    b.dropoff_address,
    b.pickup_lat,
    b.pickup_lng,
    b.dropoff_lat,
    b.dropoff_lng
  )
  ON CONFLICT (booking_id) DO UPDATE
    SET status = CASE WHEN public.pasugo_dispatch_jobs.status IN ('cancelled', 'failed') THEN 'searching' ELSE public.pasugo_dispatch_jobs.status END,
        updated_at = now()
  RETURNING id INTO job_id;

  UPDATE public.pasugo_bookings
  SET status = 'finding_rider',
      estimated_distance_km = dist,
      estimated_fare = fee,
      updated_at = now()
  WHERE id = b.id;

  PERFORM public.pasugo_dispatch_broadcast(job_id);

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (b.customer_id, 'Finding a rider', 'We are searching for nearby riders for your Pasugo booking.', 'dispatch');

  RETURN job_id;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_start(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_start(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_retry(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();
  next_radius numeric;
BEGIN
  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'searching' THEN RETURN false; END IF;
  IF j.expires_at IS NOT NULL AND j.expires_at > now() THEN RETURN false; END IF;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id FOR UPDATE;
  IF NOT FOUND OR b.status IN ('cancelled', 'completed') THEN RETURN false; END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.has_role(uid, 'admin')
    OR uid = b.customer_id
  ) THEN
    RAISE EXCEPTION 'You are not authorized to retry this booking.';
  END IF;

  UPDATE public.pasugo_dispatch_offers SET status = 'expired', updated_at = now()
  WHERE job_id = j.id AND status = 'pending' AND expires_at <= now();

  IF j.attempt >= COALESCE(j.max_attempts, 5) THEN
    UPDATE public.pasugo_dispatch_jobs SET status = 'failed', updated_at = now() WHERE id = j.id;
    UPDATE public.pasugo_bookings SET status = 'failed', updated_at = now() WHERE id = j.booking_id;
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (b.customer_id, 'No rider available', 'No rider accepted your Pasugo booking.', 'dispatch');
    RETURN false;
  END IF;

  next_radius := j.radius_km;
  IF COALESCE((s->>'dispatch_auto_expand')::boolean, true) THEN
    next_radius := LEAST(
      COALESCE((s->>'dispatch_max_radius_km')::numeric, 10),
      j.radius_km + COALESCE((s->>'dispatch_radius_expansion_km')::numeric, 2)
    );
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET attempt = j.attempt + 1,
      radius_km = next_radius,
      updated_at = now()
  WHERE id = j.id;

  PERFORM public.pasugo_dispatch_broadcast(j.id);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_retry(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_retry(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_available_riders_count(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  cnt integer;
BEGIN
  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.has_role(uid, 'admin')
    OR uid = b.customer_id
    OR uid = j.assigned_rider_id
    OR EXISTS (
      SELECT 1
      FROM public.pasugo_dispatch_offers o
      WHERE o.job_id = j.id
        AND o.rider_id = uid
    )
  ) THEN
    RAISE EXCEPTION 'You are not authorized to inspect this booking.';
  END IF;

  SELECT COUNT(*)::int INTO cnt
  FROM public.rider_status rs
  JOIN public.user_roles ur ON ur.user_id = rs.user_id AND ur.role = 'rider'
  JOIN public.profiles p ON p.id = rs.user_id
  LEFT JOIN public.wallets w ON w.user_id = rs.user_id AND w.wallet_type = 'rider' AND w.deleted_at IS NULL
  WHERE rs.is_online
    AND rs.is_available
    AND p.account_status = 'active'
    AND COALESCE(w.balance, 0) >= public.minimum_wallet_balance_for_role('rider')
    AND (
      public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) IS NULL
      OR public.haversine_km(rs.latitude, rs.longitude, j.pickup_lat, j.pickup_lng) <= j.radius_km
    );

  RETURN COALESCE(cnt, 0);
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_available_riders_count(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_available_riders_count(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_accept(_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
  uid uuid := auth.uid();
  required_balance numeric;
  current_balance numeric;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;
  IF NOT public.has_role(uid, 'rider') THEN RAISE EXCEPTION 'Only approved riders can accept bookings.'; END IF;

  required_balance := public.minimum_wallet_balance_for_role('rider');
  SELECT balance INTO current_balance
  FROM public.wallets
  WHERE user_id = uid AND wallet_type = 'rider' AND deleted_at IS NULL
  LIMIT 1;

  IF current_balance IS NULL OR current_balance < required_balance THEN
    RAISE EXCEPTION 'Your rider wallet balance must be at least ₱% to accept bookings.', required_balance;
  END IF;

  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found.'; END IF;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id FOR UPDATE;
  IF NOT FOUND OR b.status IN ('cancelled', 'completed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pasugo_dispatch_offers
    WHERE job_id = j.id
      AND rider_id = uid
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This booking was not offered to you.';
  END IF;

  IF j.status <> 'searching' OR j.assigned_rider_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'taken');
  END IF;

  UPDATE public.pasugo_dispatch_jobs
  SET status = 'assigned', assigned_rider_id = uid, assigned_at = now(), expires_at = NULL, updated_at = now()
  WHERE id = j.id;

  UPDATE public.pasugo_dispatch_offers SET status = 'accepted', responded_at = now()
  WHERE job_id = j.id AND rider_id = uid;

  UPDATE public.pasugo_dispatch_offers SET status = 'cancelled', responded_at = now()
  WHERE job_id = j.id AND rider_id <> uid AND status = 'pending';

  UPDATE public.rider_status
  SET is_available = false, updated_at = now()
  WHERE user_id = uid;

  UPDATE public.pasugo_bookings
  SET assigned_rider_id = uid,
      status = 'accepted',
      updated_at = now()
  WHERE id = j.booking_id;

  INSERT INTO public.notifications (user_id, title, body, kind)
  VALUES (b.customer_id, 'Rider assigned', 'A rider accepted your Pasugo booking.', 'dispatch');

  RETURN jsonb_build_object('ok', true, 'booking_id', j.booking_id);
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_accept(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_accept(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_decline(_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  UPDATE public.pasugo_dispatch_offers
  SET status = 'declined', responded_at = now(), updated_at = now()
  WHERE job_id = _job_id
    AND rider_id = uid
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This booking offer is not pending for you.';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_decline(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_decline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pasugo_dispatch_advance(_job_id uuid, _step text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.pasugo_dispatch_jobs%ROWTYPE;
  b public.pasugo_bookings%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required.'; END IF;

  SELECT * INTO j FROM public.pasugo_dispatch_jobs WHERE id = _job_id FOR UPDATE;
  IF NOT FOUND OR j.assigned_rider_id IS DISTINCT FROM uid THEN
    RAISE EXCEPTION 'This booking is not assigned to you.';
  END IF;

  SELECT * INTO b FROM public.pasugo_bookings WHERE id = j.booking_id FOR UPDATE;
  IF NOT FOUND OR b.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;

  IF _step = 'arrived' THEN
    IF j.status <> 'assigned' OR b.status <> 'accepted' THEN
      RAISE EXCEPTION 'This booking cannot be marked as arrived yet.';
    END IF;

    UPDATE public.pasugo_bookings
    SET status = 'rider_arriving',
        updated_at = now()
    WHERE id = j.booking_id;

  ELSIF _step = 'picked_up' THEN
    IF j.status <> 'assigned' OR b.status NOT IN ('accepted', 'rider_arriving') THEN
      RAISE EXCEPTION 'This booking cannot be marked as picked up yet.';
    END IF;

    UPDATE public.pasugo_dispatch_jobs
    SET status = 'picked_up',
        picked_up_at = now(),
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET status = 'on_the_way',
        updated_at = now()
    WHERE id = j.booking_id;

  ELSIF _step = 'delivered' THEN
    IF j.status <> 'picked_up' OR b.status <> 'on_the_way' THEN
      RAISE EXCEPTION 'This booking cannot be marked as delivered yet.';
    END IF;

    UPDATE public.pasugo_dispatch_jobs
    SET status = 'delivered',
        delivered_at = now(),
        updated_at = now()
    WHERE id = j.id;

    UPDATE public.pasugo_bookings
    SET status = 'delivered',
        updated_at = now()
    WHERE id = j.booking_id;

    UPDATE public.rider_status
    SET is_available = true,
        updated_at = now()
    WHERE user_id = uid;

  ELSIF _step = 'completed' THEN
    IF j.status <> 'delivered' OR b.status <> 'delivered' THEN
      RAISE EXCEPTION 'This booking cannot be completed yet.';
    END IF;

    UPDATE public.pasugo_bookings
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = j.booking_id;

    UPDATE public.rider_status
    SET is_available = true,
        updated_at = now()
    WHERE user_id = uid;

  ELSE
    RAISE EXCEPTION 'Unknown step.';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.pasugo_dispatch_advance(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pasugo_dispatch_advance(uuid, text) TO authenticated, service_role;