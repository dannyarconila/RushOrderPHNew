import type { AppRole } from "@/types";

type NotificationRouteInput = {
  kind: string | null | undefined;
  role: AppRole;
  pasugoBookingId?: string | null;
};

export function getNotificationDestination({
  kind,
  role,
  pasugoBookingId,
}: NotificationRouteInput): string {
  switch (kind) {
    case "rider_location_service":
      return role === "rider" ? "/rider#location-service" : getDashboardRoute(role);

    case "wallet":
      if (role === "rider") return "/rider-wallet";
      if (role === "seller") return "/seller-wallet";
      if (role === "admin") return "/internal-admin/wallets";
      return getDashboardRoute(role);

    case "order":
      if (role === "seller") return "/store-orders";
      if (role === "rider") return "/rider";
      if (role === "customer") return "/customer";
      if (role === "admin") return "/internal-admin/orders";
      return getDashboardRoute(role);

    case "dispatch":
    case "booking":
    case "pasugo":
      if (role === "rider") return "/rider";
      if (role === "customer" && pasugoBookingId) {
        return `/pasugo/${encodeURIComponent(pasugoBookingId)}`;
      }
      if (role === "customer") return "/pasugo";
      return getDashboardRoute(role);

    default:
      return getDashboardRoute(role);
  }
}

function getDashboardRoute(role: AppRole): string {
  switch (role) {
    case "rider":
      return "/rider";
    case "seller":
      return "/seller";
    case "admin":
      return "/internal-admin";
    case "customer":
    default:
      return "/customer";
  }
}
