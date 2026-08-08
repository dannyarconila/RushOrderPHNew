-- Phase 2: secure order engine.
-- Move authoritative order creation, pricing, stock reservation, and
-- idempotency into the database.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS inventory_reserved boolean NOT NULL DEFAULT false;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS line_subtotal numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS orders_customer_idempotency_key_idx
  ON public.orders (customer_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items (product_id);

CREATE OR REPLACE FUNCTION public.guard_order_financial_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;
  NEW.subtotal := OLD.subtotal;
  NEW.delivery_fee := OLD.delivery_fee;
  NEW.surge_fee := OLD.surge_fee;
  NEW.tax := OLD.tax;
  NEW.total := OLD.total;
  NEW.seller_commission := OLD.seller_commission;
  NEW.rider_commission := OLD.rider_commission;
  NEW.payment_status := OLD.payment_status;
  NEW.payment_method := OLD.payment_method;
  NEW.customer_id := OLD.customer_id;
  NEW.store_id := OLD.store_id;
  NEW.distance_km := OLD.distance_km;
  NEW.claim_number := OLD.claim_number;
  NEW.idempotency_key := OLD.idempotency_key;
  NEW.inventory_reserved := OLD.inventory_reserved;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_is_open_now(
  _hours jsonb,
  _at timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  weekday_key text;
  entry jsonb;
  opens_at time;
  closes_at time;
  current_time_value time := (_at AT TIME ZONE 'Asia/Manila')::time;
  is_closed boolean;
BEGIN
  weekday_key := CASE EXTRACT(ISODOW FROM (_at AT TIME ZONE 'Asia/Manila'))::int
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    ELSE 'sun'
  END;

  entry := COALESCE(_hours -> weekday_key, '{}'::jsonb);
  is_closed := COALESCE((entry ->> 'closed')::boolean, false);
  IF is_closed THEN
    RETURN false;
  END IF;

  opens_at := COALESCE(NULLIF(entry ->> 'open', ''), '08:00')::time;
  closes_at := COALESCE(NULLIF(entry ->> 'close', ''), '20:00')::time;

  IF closes_at > opens_at THEN
    RETURN current_time_value >= opens_at AND current_time_value < closes_at;
  END IF;

  RETURN current_time_value >= opens_at OR current_time_value < closes_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_order_claim_number()
RETURNS text
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'RO-'
    || to_char(timezone('Asia/Manila', clock_timestamp()), 'YYMMDDHH24MISSMS')
    || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
$$;

CREATE OR REPLACE FUNCTION public.create_order_secure(
  _store_id uuid,
  _address_id uuid,
  _payment_method public.payment_method,
  _notes text DEFAULT NULL,
  _items jsonb DEFAULT '[]'::jsonb,
  _idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  store_row public.stores%ROWTYPE;
  address_row public.addresses%ROWTYPE;
  existing_order_id uuid;
  dispatch_cfg jsonb := public.dispatch_settings();
  subtotal_amount numeric := 0;
  delivery_fee_amount numeric := 0;
  surge_fee_amount numeric := 0;
  tax_amount numeric := 0;
  total_amount numeric := 0;
  seller_commission_amount numeric := 0;
  rider_commission_amount numeric := 0;
  distance_amount numeric := 0;
  tax_rate numeric := 0;
  seller_commission_rate numeric := 0.1;
  surge_multiplier numeric := 1;
  rider_delivery_fee numeric := 5;
  delivery_base_fee numeric := 0;
  delivery_per_km_fee numeric := 0;
  delivery_base_km numeric := 0;
  has_dispatch_pricing boolean := false;
  fee_per_km numeric := 0;
  min_fee numeric := 0;
  max_fee numeric := 999999999;
  requested record;
  product_row public.products%ROWTYPE;
  order_id uuid;
  normalized_notes text := NULLIF(btrim(COALESCE(_notes, '')), '');
  validated_items jsonb := '[]'::jsonb;
  line_subtotal_value numeric;
  minimum_order_amount numeric := 0;
  advisory_lock_key bigint;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Please sign in to place an order.';
  END IF;

  IF _store_id IS NULL OR _address_id IS NULL THEN
    RAISE EXCEPTION 'Your order is missing store or address information.';
  END IF;

  IF _idempotency_key IS NULL OR btrim(_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Your order could not be created. Please try again.';
  END IF;

  IF jsonb_typeof(COALESCE(_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(COALESCE(_items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  advisory_lock_key := hashtextextended(uid::text || ':' || btrim(_idempotency_key), 0);
  PERFORM pg_advisory_xact_lock(advisory_lock_key);

  SELECT o.id INTO existing_order_id
  FROM public.orders o
  WHERE o.customer_id = uid
    AND o.idempotency_key = btrim(_idempotency_key)
  LIMIT 1;

  IF existing_order_id IS NOT NULL THEN
    RETURN existing_order_id;
  END IF;

  SELECT * INTO store_row
  FROM public.stores
  WHERE id = _store_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND
     OR store_row.is_active IS DISTINCT FROM true
     OR store_row.is_approved IS DISTINCT FROM true
     OR store_row.verification_status IS DISTINCT FROM 'verified'
     OR store_row.wallet_hold IS TRUE
     OR store_row.is_online IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'The store is currently unavailable.';
  END IF;

  IF NOT public.store_is_open_now(store_row.business_hours) THEN
    RAISE EXCEPTION 'The store is currently unavailable.';
  END IF;

  SELECT * INTO address_row
  FROM public.addresses
  WHERE id = _address_id
    AND user_id = uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Please choose a valid delivery address.';
  END IF;

  IF store_row.latitude IS NULL OR store_row.longitude IS NULL
     OR address_row.latitude IS NULL OR address_row.longitude IS NULL THEN
    RAISE EXCEPTION 'Your selected address is missing map coordinates.';
  END IF;

  distance_amount := round(
    public.haversine_km(store_row.latitude, store_row.longitude, address_row.latitude, address_row.longitude),
    2
  );

  IF distance_amount IS NULL OR distance_amount < 0 THEN
    RAISE EXCEPTION 'We could not validate the delivery distance for this order.';
  END IF;

  IF COALESCE(store_row.delivery_radius_km, 0) > 0 AND distance_amount > store_row.delivery_radius_km THEN
    RAISE EXCEPTION 'The store is currently unavailable.';
  END IF;

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 0)
  INTO tax_rate
  FROM public.system_settings
  WHERE key = 'tax_rate';

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 0.1)
  INTO seller_commission_rate
  FROM public.system_settings
  WHERE key = 'seller_commission_rate';

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 1)
  INTO surge_multiplier
  FROM public.system_settings
  WHERE key = 'surge_multiplier';

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 5)
  INTO rider_delivery_fee
  FROM public.system_settings
  WHERE key = 'rider_delivery_fee';

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 0)
  INTO delivery_base_fee
  FROM public.system_settings
  WHERE key = 'delivery_base_fee';

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 0)
  INTO delivery_per_km_fee
  FROM public.system_settings
  WHERE key = 'delivery_per_km_fee';

  SELECT COALESCE(trim(both '"' FROM value::text)::numeric, 0)
  INTO delivery_base_km
  FROM public.system_settings
  WHERE key = 'delivery_base_km';

  has_dispatch_pricing := dispatch_cfg ? 'dispatch_fee_per_km'
    OR dispatch_cfg ? 'dispatch_min_fee'
    OR dispatch_cfg ? 'dispatch_max_fee';

  fee_per_km := CASE
    WHEN dispatch_cfg ? 'dispatch_fee_per_km' THEN COALESCE(trim(both '"' FROM (dispatch_cfg -> 'dispatch_fee_per_km')::text)::numeric, 0)
    ELSE 0
  END;
  min_fee := CASE
    WHEN dispatch_cfg ? 'dispatch_min_fee' THEN COALESCE(trim(both '"' FROM (dispatch_cfg -> 'dispatch_min_fee')::text)::numeric, 0)
    ELSE 0
  END;
  max_fee := CASE
    WHEN dispatch_cfg ? 'dispatch_max_fee' THEN COALESCE(trim(both '"' FROM (dispatch_cfg -> 'dispatch_max_fee')::text)::numeric, 999999999)
    ELSE 999999999
  END;

  FOR requested IN
    SELECT product_id, quantity
    FROM (
      SELECT
        nullif(btrim(product_id), '') AS product_id,
        sum(quantity)::numeric AS quantity
      FROM jsonb_to_recordset(_items) AS x(product_id text, quantity numeric)
      GROUP BY nullif(btrim(product_id), '')
    ) aggregated
    ORDER BY product_id
  LOOP
    IF requested.product_id IS NULL THEN
      RAISE EXCEPTION 'One or more products are no longer available.';
    END IF;

    IF requested.quantity IS NULL
       OR requested.quantity <= 0
       OR requested.quantity <> trunc(requested.quantity) THEN
      RAISE EXCEPTION 'One or more item quantities are invalid.';
    END IF;

    SELECT * INTO product_row
    FROM public.products
    WHERE id::text = requested.product_id
      AND store_id = _store_id
      AND deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND OR product_row.is_published IS DISTINCT FROM true OR product_row.is_available IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'One or more products are no longer available.';
    END IF;

    IF product_row.stock < requested.quantity::int THEN
      RAISE EXCEPTION 'Some items are out of stock.';
    END IF;

    line_subtotal_value := round(COALESCE(product_row.price, 0) * requested.quantity, 2);
    subtotal_amount := subtotal_amount + line_subtotal_value;

    UPDATE public.products
    SET stock = stock - requested.quantity::int,
        is_available = CASE WHEN stock - requested.quantity::int > 0 THEN is_available ELSE false END,
        updated_at = now()
    WHERE id = product_row.id;

    validated_items := validated_items || jsonb_build_array(
      jsonb_build_object(
        'product_id', product_row.id,
        'product_name', product_row.name,
        'unit_price', round(COALESCE(product_row.price, 0), 2),
        'quantity', requested.quantity::int,
        'line_subtotal', line_subtotal_value
      )
    );
  END LOOP;

  subtotal_amount := round(subtotal_amount, 2);
  minimum_order_amount := COALESCE(store_row.minimum_order, 0);

  IF subtotal_amount <= 0 THEN
    RAISE EXCEPTION 'Your cart is empty.';
  END IF;

  IF minimum_order_amount > 0 AND subtotal_amount < minimum_order_amount THEN
    RAISE EXCEPTION 'The store is currently unavailable.';
  END IF;

  IF store_row.delivery_fee_override IS NOT NULL AND store_row.delivery_fee_override >= 0 THEN
    delivery_fee_amount := round(store_row.delivery_fee_override, 2);
  ELSIF has_dispatch_pricing THEN
    delivery_fee_amount := round(
      GREATEST(min_fee, LEAST(max_fee, round(distance_amount * GREATEST(fee_per_km, 0), 2))),
      2
    );
  ELSE
    delivery_fee_amount := round(
      delivery_base_fee + GREATEST(0, distance_amount - delivery_base_km) * delivery_per_km_fee,
      2
    );
  END IF;

  surge_fee_amount := round(delivery_fee_amount * GREATEST(0, surge_multiplier - 1), 2);
  tax_amount := round(subtotal_amount * GREATEST(tax_rate, 0), 2);
  seller_commission_amount := round(subtotal_amount * GREATEST(seller_commission_rate, 0), 2);
  rider_commission_amount := round(GREATEST(rider_delivery_fee, 0), 2);
  total_amount := round(subtotal_amount + delivery_fee_amount + surge_fee_amount + tax_amount, 2);

  INSERT INTO public.orders (
    customer_id,
    store_id,
    address_id,
    status,
    payment_method,
    payment_status,
    subtotal,
    delivery_fee,
    surge_fee,
    tax,
    total,
    seller_commission,
    rider_commission,
    distance_km,
    claim_number,
    notes,
    idempotency_key,
    inventory_reserved
  ) VALUES (
    uid,
    _store_id,
    _address_id,
    'pending',
    _payment_method,
    'pending',
    subtotal_amount,
    delivery_fee_amount,
    surge_fee_amount,
    tax_amount,
    total_amount,
    seller_commission_amount,
    rider_commission_amount,
    distance_amount,
    public.generate_order_claim_number(),
    normalized_notes,
    btrim(_idempotency_key),
    true
  )
  RETURNING id INTO order_id;

  INSERT INTO public.order_items (
    order_id,
    product_id,
    product_name,
    unit_price,
    quantity,
    line_subtotal
  )
  SELECT
    order_id,
    (item ->> 'product_id')::uuid,
    item ->> 'product_name',
    COALESCE((item ->> 'unit_price')::numeric, 0),
    COALESCE((item ->> 'quantity')::int, 0),
    COALESCE((item ->> 'line_subtotal')::numeric, 0)
  FROM jsonb_array_elements(validated_items) AS item;

  RETURN order_id;
EXCEPTION
  WHEN unique_violation THEN
    SELECT o.id INTO existing_order_id
    FROM public.orders o
    WHERE o.customer_id = uid
      AND o.idempotency_key = btrim(_idempotency_key)
    LIMIT 1;

    IF existing_order_id IS NOT NULL THEN
      RETURN existing_order_id;
    END IF;

    RAISE EXCEPTION 'Your order could not be created. Please try again.';
END;
$$;
REVOKE ALL ON FUNCTION public.create_order_secure(uuid, uuid, public.payment_method, text, jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_order_secure(uuid, uuid, public.payment_method, text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sync_order_inventory_on_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_shortage boolean;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Backward compatibility for legacy pending orders created before inventory
  -- reservation moved to create_order_secure().
  IF OLD.status = 'pending' AND NEW.status = 'confirmed' AND COALESCE(OLD.inventory_reserved, false) = false THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
        AND COALESCE(p.stock, 0) < oi.quantity
      FOR UPDATE OF p
    )
    INTO has_shortage;

    IF has_shortage THEN
      RAISE EXCEPTION 'Insufficient stock to accept this order.';
    END IF;

    UPDATE public.products p
    SET stock = p.stock - oi.quantity,
        is_available = CASE WHEN p.stock - oi.quantity > 0 THEN p.is_available ELSE false END,
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;

    NEW.inventory_reserved := true;
  END IF;

  IF OLD.status IN ('pending', 'confirmed', 'preparing', 'ready')
     AND NEW.status = 'cancelled'
     AND COALESCE(OLD.inventory_reserved, false) = true THEN
    UPDATE public.products p
    SET stock = p.stock + oi.quantity,
        is_available = true,
        updated_at = now()
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.product_id = p.id;

    NEW.inventory_reserved := false;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE INSERT ON public.orders FROM authenticated;
REVOKE INSERT ON public.order_items FROM authenticated;

DROP POLICY IF EXISTS "orders_insert_own" ON public.orders;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_via_order" ON public.order_items;

CREATE POLICY "order_items_via_order" ON public.order_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.customer_id = auth.uid()
        OR o.rider_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin')
        OR EXISTS (
          SELECT 1
          FROM public.stores s
          WHERE s.id = o.store_id
            AND s.owner_id = auth.uid()
        )
      )
  )
);