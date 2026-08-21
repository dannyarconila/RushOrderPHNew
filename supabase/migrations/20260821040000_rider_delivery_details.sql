-- Secure rider-only delivery details.
-- A rider may only retrieve customer/order information for an order
-- that has an active pending/accepted offer assigned to that rider.

CREATE OR REPLACE FUNCTION public.rider_delivery_details(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.dispatch_offers o
    WHERE o.order_id = _order_id
      AND o.rider_id = auth.uid()
      AND o.status IN ('pending', 'accepted')
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.dispatch_jobs j
    WHERE j.order_id = _order_id
      AND j.assigned_rider_id = auth.uid()
      AND j.status IN ('assigned', 'picked_up')
  ) THEN
    RAISE EXCEPTION 'You are not authorized to view this delivery.';
  END IF;

  SELECT jsonb_build_object(
    'order_id', o.id,
    'claim_number', o.claim_number,
    'customer_name',
      COALESCE(a.recipient_name, p.full_name, 'Customer'),
    'customer_phone',
      COALESCE(a.phone, p.phone),
    'customer_address',
      NULLIF(
        concat_ws(
          ', ',
          a.line1,
          a.line2,
          a.barangay,
          a.city,
          a.province,
          a.postal_code
        ),
        ''
      ),
    'store_name', s.name,
    'store_address', s.address,
    'store_phone', s.phone,
    'subtotal', o.subtotal,
    'delivery_fee', o.delivery_fee,
    'total', o.total,
    'distance_km', j.distance_km,
    'pickup_address', j.pickup_address,
    'dropoff_address', j.dropoff_address,
    'items',
      COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', oi.id,
              'product_name', oi.product_name,
              'quantity', oi.quantity,
              'unit_price', oi.unit_price,
              'line_total', oi.line_total
            )
            ORDER BY oi.created_at
          )
          FROM public.order_items oi
          WHERE oi.order_id = o.id
        ),
        '[]'::jsonb
      )
  )
  INTO result
  FROM public.orders o
  LEFT JOIN public.profiles p
    ON p.id = o.customer_id
  LEFT JOIN public.addresses a
    ON a.id = o.address_id
  LEFT JOIN public.stores s
    ON s.id = o.store_id
  LEFT JOIN public.dispatch_jobs j
    ON j.order_id = o.id
  WHERE o.id = _order_id
  LIMIT 1;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Delivery order not found.';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL
ON FUNCTION public.rider_delivery_details(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.rider_delivery_details(uuid)
TO authenticated, service_role;
