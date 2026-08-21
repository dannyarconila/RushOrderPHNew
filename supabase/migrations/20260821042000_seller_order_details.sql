-- Secure seller-only incoming order details.
-- A seller may only retrieve details for an order belonging
-- to one of their own stores.

CREATE OR REPLACE FUNCTION public.seller_order_details(_order_id uuid)
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
    FROM public.orders o
    JOIN public.stores s
      ON s.id = o.store_id
    WHERE o.id = _order_id
      AND s.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not authorized to view this order.';
  END IF;

  SELECT jsonb_build_object(
    'order_id', o.id,
    'claim_number', o.claim_number,
    'status', o.status,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,

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

    'store_name',
      s.name,

    'store_address',
      s.address,

    'store_phone',
      s.phone,

    'subtotal',
      o.subtotal,

    'delivery_fee',
      o.delivery_fee,

    'surge_fee',
      o.surge_fee,

    'tax',
      o.tax,

    'total',
      o.total,

    'distance_km',
      o.distance_km,

    'notes',
      o.notes,

    'created_at',
      o.created_at,

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
  WHERE o.id = _order_id
  LIMIT 1;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL
ON FUNCTION public.seller_order_details(uuid)
FROM public, anon;

GRANT EXECUTE
ON FUNCTION public.seller_order_details(uuid)
TO authenticated, service_role;
