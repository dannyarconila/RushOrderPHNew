-- Notify customers and sellers when the seller-side order lifecycle changes.
-- Rider assignment / pickup / delivery notifications are intentionally left
-- to the existing dispatch workflow to avoid duplicate push notifications.

CREATE OR REPLACE FUNCTION public.transition_order_status(
  _order_id uuid,
  _next_status order_status
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  order_row public.orders%ROWTYPE;
  is_store_owner boolean := false;
  product_summary text;
  notification_title text;
  notification_body text;
BEGIN
  SELECT *
  INTO order_row
  FROM public.orders
  WHERE id = _order_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  -- Build a human-readable product summary for notifications.
  SELECT string_agg(
    CASE
      WHEN oi.quantity > 1
        THEN oi.quantity::text || ' x ' || oi.product_name
      ELSE oi.product_name
    END,
    ', '
    ORDER BY oi.created_at
  )
  INTO product_summary
  FROM public.order_items oi
  WHERE oi.order_id = order_row.id;

  product_summary := COALESCE(
    NULLIF(product_summary, ''),
    'Order #' || left(order_row.id::text, 8)
  );

  -- Admin/service-role transitions retain the existing authorization behavior.
  IF public.is_portal_admin()
     OR public.has_role(uid, 'admin')
     OR current_user IN ('service_role', 'postgres')
  THEN
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
    IF NOT (
      order_row.status = 'pending'
      AND _next_status = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'Customers may only cancel pending orders.';
    END IF;

  ELSIF is_store_owner THEN
    IF NOT (
      (
        order_row.status = 'pending'
        AND _next_status IN ('confirmed', 'cancelled')
      )
      OR (
        order_row.status = 'confirmed'
        AND _next_status IN ('preparing', 'cancelled')
      )
      OR (
        order_row.status = 'preparing'
        AND _next_status IN ('ready', 'cancelled')
      )
      OR (
        order_row.status = 'ready'
        AND _next_status = 'cancelled'
      )
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

  -- Customer-facing seller lifecycle notifications.
  IF uid = order_row.customer_id
     AND order_row.status = 'pending'
     AND _next_status = 'cancelled'
  THEN
    -- Notify the store owner when the customer cancels a pending order.
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      kind
    )
    SELECT
      s.owner_id,
      'Order cancelled',
      product_summary || ' was cancelled by the customer.',
      'order'
    FROM public.stores s
    WHERE s.id = order_row.store_id;

  ELSIF is_store_owner THEN

    IF _next_status = 'confirmed' THEN
      notification_title := 'Order accepted';
      notification_body :=
        product_summary || ' has been accepted by the store.';

    ELSIF _next_status = 'preparing' THEN
      notification_title := 'Order being prepared';
      notification_body :=
        product_summary || ' is now being prepared by the store.';

    ELSIF _next_status = 'ready' THEN
      notification_title := 'Order ready';
      notification_body :=
        product_summary || ' is ready for pickup. We''re finding a rider.';

    ELSIF _next_status = 'cancelled' THEN
      notification_title := 'Order cancelled';
      notification_body :=
        product_summary || ' was cancelled by the store.';

    END IF;

    IF notification_title IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        kind
      )
      VALUES (
        order_row.customer_id,
        notification_title,
        notification_body,
        'order'
      );
    END IF;

  END IF;

  RETURN true;
END;
$function$;
