-- Defense-in-depth guard for marketplace dispatch.
--
-- dispatch_jobs are already cancelled by the order-cancellation trigger and
-- dispatch_retry() also verifies that the order is still ready.
-- This additional guard prevents dispatch_broadcast() itself from creating
-- rider offers for a cancelled/non-ready order.

CREATE OR REPLACE FUNCTION public.dispatch_broadcast(_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  j public.dispatch_jobs%ROWTYPE;
  uid uuid := auth.uid();
  s jsonb := public.dispatch_settings();

  timeout_s integer :=
    COALESCE(
      (s->>'dispatch_timeout_seconds')::int,
      30
    );

  strategy text :=
    NULLIF(
      COALESCE(s->>'dispatch_strategy', ''),
      ''
    );

  retry_rider_strategy text :=
    COALESCE(
      NULLIF(s->>'dispatch_retry_rider_strategy', ''),
      'exclude_timed_out'
    );

  order_status public.order_status;

  sent integer := 0;
  r record;
  cap integer;
  rider_title text;
  rider_body text;
BEGIN

  -- ----------------------------------------------------------
  -- Lock dispatch job.
  -- ----------------------------------------------------------
  SELECT *
  INTO j
  FROM public.dispatch_jobs
  WHERE id = _job_id
  FOR UPDATE;

  IF NOT FOUND OR j.status <> 'searching' THEN
    RETURN 0;
  END IF;


  -- ----------------------------------------------------------
  -- AUTHORITATIVE ORDER STATUS GUARD.
  --
  -- A dispatch job must never create rider offers unless the
  -- associated marketplace order is still ready for pickup.
  -- This check runs before authorization so service_role and
  -- background workers cannot bypass it.
  -- ----------------------------------------------------------
  SELECT o.status
  INTO order_status
  FROM public.orders o
  WHERE o.id = j.order_id;

  IF NOT FOUND OR order_status <> 'ready' THEN

    UPDATE public.dispatch_jobs
    SET
      status = CASE
        WHEN order_status = 'cancelled'
          THEN 'cancelled'::dispatch_job_status
        ELSE 'failed'::dispatch_job_status
      END,
      updated_at = now()
    WHERE id = j.id
      AND status = 'searching';

    RETURN 0;
  END IF;


  -- ----------------------------------------------------------
  -- Authorization.
  -- ----------------------------------------------------------
  IF NOT (
    current_user IN ('service_role', 'postgres')
    OR public.is_portal_admin()
    OR public.has_role(uid, 'admin')
    OR EXISTS (
      SELECT 1
      FROM public.stores st
      JOIN public.orders o
        ON o.store_id = st.id
      WHERE st.id = j.store_id
        AND st.owner_id = uid
        AND o.id = j.order_id
        AND o.status = 'ready'
    )
  ) THEN
    RAISE EXCEPTION
      'You are not authorized to broadcast this dispatch job.';
  END IF;


  -- ----------------------------------------------------------
  -- Dispatch strategy.
  -- ----------------------------------------------------------
  strategy := COALESCE(
    NULLIF(strategy, ''),
    'nearest_first'
  );

  cap := CASE strategy
    WHEN 'nearest_first' THEN 1
    WHEN 'wave' THEN 3
    ELSE 50
  END;


  -- ----------------------------------------------------------
  -- Candidate riders.
  --
  -- all_eligible:
  --   previously expired riders may receive the booking again.
  --
  -- exclude_timed_out:
  --   riders with a previous expired offer for this job are
  --   excluded from future retries.
  --
  -- declined riders remain excluded in both modes.
  -- ----------------------------------------------------------
  FOR r IN
    SELECT
      rs.user_id,
      public.haversine_km(
        rs.latitude,
        rs.longitude,
        j.pickup_lat,
        j.pickup_lng
      ) AS dist

    FROM public.rider_status rs

    JOIN public.user_roles ur
      ON ur.user_id = rs.user_id
     AND ur.role = 'rider'

    JOIN public.profiles p
      ON p.id = rs.user_id

    JOIN public.wallets w
      ON w.user_id = rs.user_id
     AND w.wallet_type = 'rider'
     AND w.deleted_at IS NULL

    WHERE rs.is_online
      AND rs.is_available

      AND COALESCE(w.balance, 0)
        >= public.minimum_wallet_balance_for_role('rider')

      AND p.account_status = 'active'

      AND (
        public.haversine_km(
          rs.latitude,
          rs.longitude,
          j.pickup_lat,
          j.pickup_lng
        ) IS NULL

        OR public.haversine_km(
          rs.latitude,
          rs.longitude,
          j.pickup_lat,
          j.pickup_lng
        ) <= j.radius_km
      )

      -- Always exclude riders who explicitly declined.
      AND NOT EXISTS (
        SELECT 1
        FROM public.dispatch_offers previous_offer
        WHERE previous_offer.job_id = j.id
          AND previous_offer.rider_id = rs.user_id
          AND previous_offer.status = 'declined'
      )

      -- Optional exclusion of previously timed-out riders.
      AND (
        retry_rider_strategy = 'all_eligible'

        OR NOT EXISTS (
          SELECT 1
          FROM public.dispatch_offers previous_offer
          WHERE previous_offer.job_id = j.id
            AND previous_offer.rider_id = rs.user_id
            AND previous_offer.status = 'expired'
        )
      )

    ORDER BY
      dist NULLS LAST,
      rs.last_seen_at DESC

    LIMIT cap

  LOOP

    INSERT INTO public.dispatch_offers (
      job_id,
      order_id,
      rider_id,
      attempt,
      distance_km,
      expires_at
    )
    VALUES (
      j.id,
      j.order_id,
      r.user_id,
      j.attempt,
      r.dist,
      now() + make_interval(secs => timeout_s)
    )
    ON CONFLICT (job_id, rider_id, attempt)
    DO NOTHING;


    IF FOUND THEN

      sent := sent + 1;

      rider_title :=
        CASE
          WHEN j.dispatch_type = 'pasugo'
            THEN 'New Pasugo booking'
          ELSE
            'New delivery request'
        END;

      rider_body :=
        CASE
          WHEN j.dispatch_type = 'pasugo'
            THEN
              'A nearby customer needs errand help — PHP '
              || to_char(
                j.delivery_fee,
                'FM999999990.00'
              )

          ELSE
            COALESCE(j.store_name, 'A store')
            || ' needs a rider — PHP '
            || to_char(
              j.delivery_fee,
              'FM999999990.00'
            )
        END;

      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        kind
      )
      VALUES (
        r.user_id,
        rider_title,
        rider_body,
        'dispatch'
      );

    END IF;

  END LOOP;


  -- ----------------------------------------------------------
  -- Update dispatch job timeout window.
  -- ----------------------------------------------------------
  UPDATE public.dispatch_jobs
  SET
    expires_at =
      now() + make_interval(secs => timeout_s),
    last_attempt_at = now(),
    updated_at = now()
  WHERE id = j.id;


  RETURN sent;

END;
$function$;

COMMENT ON FUNCTION public.dispatch_broadcast(uuid)
IS 'Broadcasts eligible rider offers only while the associated marketplace order remains ready.';
