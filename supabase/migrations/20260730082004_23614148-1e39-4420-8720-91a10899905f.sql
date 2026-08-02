-- Extend approval handler: also create the store for approved sellers
CREATE OR REPLACE FUNCTION public.handle_application_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  target_role public.app_role;
  target_wallet public.wallet_type;
  v_store_name text;
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    IF TG_TABLE_NAME = 'seller_applications' THEN
      target_role := 'seller'; target_wallet := 'seller';
    ELSE
      target_role := 'rider'; target_wallet := 'rider';
    END IF;

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.user_id, target_role)
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.wallets (user_id, wallet_type) VALUES (NEW.user_id, target_wallet)
      ON CONFLICT (user_id, wallet_type) DO NOTHING;

    IF TG_TABLE_NAME = 'seller_applications' THEN
      v_store_name := COALESCE(
        NULLIF(NEW.store_info->>'store_name', ''),
        NULLIF(NEW.business_info->>'business_name', ''),
        'RushOrder Store'
      );
      IF NOT EXISTS (SELECT 1 FROM public.stores WHERE owner_id = NEW.user_id AND deleted_at IS NULL) THEN
        INSERT INTO public.stores (owner_id, name, description, address, service_type, is_approved, is_active, is_online)
        VALUES (
          NEW.user_id,
          v_store_name,
          NULLIF(NEW.store_info->>'description', ''),
          COALESCE(NEW.address, '{}'::jsonb),
          COALESCE(NULLIF(NEW.store_info->>'service_type', ''), 'food'),
          true, true, false
        );
      ELSE
        UPDATE public.stores SET is_approved = true, is_active = true, updated_at = now()
        WHERE owner_id = NEW.user_id AND deleted_at IS NULL;
      END IF;
    END IF;

    NEW.reviewed_at := now();

    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (
      NEW.user_id,
      CASE WHEN target_role = 'seller' THEN 'Your store application was approved'
           ELSE 'Your rider application was approved' END,
      CASE WHEN target_role = 'seller'
           THEN 'Congratulations! Your storefront is ready. Open your partner dashboard to add products and go online.'
           ELSE 'Congratulations! Your rider dashboard is now active. Go online to start accepting deliveries.' END,
      'application'
    );
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    NEW.reviewed_at := now();
    INSERT INTO public.notifications (user_id, title, body, kind)
    VALUES (
      NEW.user_id,
      'Application update',
      COALESCE(NULLIF(NEW.review_notes, ''), 'Your application was not approved at this time. You can review the requirements and apply again.'),
      'application'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Activate the automation triggers (previously defined but never attached)
DROP TRIGGER IF EXISTS trg_seller_application_approval ON public.seller_applications;
CREATE TRIGGER trg_seller_application_approval
  BEFORE UPDATE ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.handle_application_approval();

DROP TRIGGER IF EXISTS trg_rider_application_approval ON public.rider_applications;
CREATE TRIGGER trg_rider_application_approval
  BEFORE UPDATE ON public.rider_applications
  FOR EACH ROW EXECUTE FUNCTION public.handle_application_approval();

-- Block duplicate active applications (function existed, trigger did not)
DROP TRIGGER IF EXISTS trg_seller_application_duplicate ON public.seller_applications;
CREATE TRIGGER trg_seller_application_duplicate
  BEFORE INSERT ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_application();

DROP TRIGGER IF EXISTS trg_rider_application_duplicate ON public.rider_applications;
CREATE TRIGGER trg_rider_application_duplicate
  BEFORE INSERT ON public.rider_applications
  FOR EACH ROW EXECUTE FUNCTION public.block_duplicate_application();

-- New-user provisioning trigger (function existed, trigger did not)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at maintenance triggers
DROP TRIGGER IF EXISTS trg_stores_updated_at ON public.stores;
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_seller_applications_updated_at ON public.seller_applications;
CREATE TRIGGER trg_seller_applications_updated_at BEFORE UPDATE ON public.seller_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_rider_applications_updated_at ON public.rider_applications;
CREATE TRIGGER trg_rider_applications_updated_at BEFORE UPDATE ON public.rider_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
