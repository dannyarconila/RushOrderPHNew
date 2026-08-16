-- Notify the store owner once when a new order's items are inserted.
-- Uses a statement-level trigger so multi-item orders generate only one
-- seller notification.

CREATE OR REPLACE FUNCTION public.notify_seller_on_new_order_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  order_group record;
  store_owner_id uuid;
  order_claim_number text;
  product_summary text;
  notification_body text;
BEGIN
  FOR order_group IN
    SELECT
      ni.order_id,
      string_agg(
        CASE
          WHEN ni.quantity > 1
            THEN ni.quantity::text || ' x ' || ni.product_name
          ELSE ni.product_name
        END,
        ', '
        ORDER BY ni.created_at, ni.id
      ) AS products
    FROM new_items ni
    GROUP BY ni.order_id
  LOOP
    SELECT
      s.owner_id,
      o.claim_number
    INTO
      store_owner_id,
      order_claim_number
    FROM public.orders o
    JOIN public.stores s
      ON s.id = o.store_id
    WHERE o.id = order_group.order_id
      AND o.deleted_at IS NULL;

    IF store_owner_id IS NULL THEN
      CONTINUE;
    END IF;

    product_summary := COALESCE(
      NULLIF(order_group.products, ''),
      'New customer order'
    );

    notification_body :=
      product_summary
      || ' — Order '
      || COALESCE(order_claim_number, left(order_group.order_id::text, 8))
      || '. Open your Orders dashboard to review it.';

    -- Prevent duplicate seller notifications for the same order.
    IF NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = store_owner_id
        AND n.kind = 'new_order'
        AND n.body = notification_body
    ) THEN
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        kind
      )
      VALUES (
        store_owner_id,
        'New order received',
        notification_body,
        'new_order'
      );
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS order_items_new_order_notification_trigger
ON public.order_items;

CREATE TRIGGER order_items_new_order_notification_trigger
AFTER INSERT ON public.order_items
REFERENCING NEW TABLE AS new_items
FOR EACH STATEMENT
EXECUTE FUNCTION public.notify_seller_on_new_order_items();