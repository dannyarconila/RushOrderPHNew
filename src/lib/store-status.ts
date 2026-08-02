/**
 * Single source of truth for how a store's state is presented anywhere in the
 * app (marketplace, store page, seller dashboard, admin portal).
 *
 * Two independent concerns, never mixed:
 *  - VISIBILITY  → `verification_status` decides whether a store may exist in
 *                  the marketplace at all. Mirrored by the `stores_public_read`
 *                  RLS policy, so anything the client receives is verified.
 *  - AVAILABILITY → `is_online` (seller switch) + `business_hours` decide
 *                  whether customers may order right now. Browsing is always
 *                  allowed.
 */
import {
  WEEKDAYS,
  isWithinBusinessHours,
  parseBusinessHours,
  type BusinessHours,
  type StoreVerificationStatus,
} from "@/lib/stores";

export interface StoreAvailability {
  /** Customers may add to cart and check out right now. */
  open: boolean;
  /** Short badge label: "Open now" / "Closed". */
  label: string;
  /** Reason / next opening, e.g. "Opens tomorrow 8:00 AM". */
  detail: string | null;
  hours: BusinessHours;
}

function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return date.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** Next day/time the schedule opens, starting from today. */
export function nextOpening(hours: BusinessHours, now = new Date()): string | null {
  const todayIndex = (now.getDay() + 6) % 7;
  for (let offset = 0; offset < 8; offset += 1) {
    const day = WEEKDAYS[(todayIndex + offset) % 7];
    const entry = hours[day.key];
    if (!entry || entry.closed) continue;
    const [h, m] = entry.open.split(":").map(Number);
    if (offset === 0) {
      const minutes = now.getHours() * 60 + now.getMinutes();
      if (minutes < (h || 0) * 60 + (m || 0)) return `Opens today ${formatTime(entry.open)}`;
      continue;
    }
    const when = offset === 1 ? "tomorrow" : day.label;
    return `Opens ${when} ${formatTime(entry.open)}`;
  }
  return null;
}

export function storeAvailability(
  store: { is_online?: boolean | null; business_hours?: unknown },
  now = new Date(),
): StoreAvailability {
  const hours = parseBusinessHours(store.business_hours);
  const withinHours = isWithinBusinessHours(hours, now);
  const accepting = store.is_online !== false;

  if (accepting && withinHours) {
    const key = WEEKDAYS[(now.getDay() + 6) % 7].key;
    return {
      open: true,
      label: "Open now",
      detail: `Until ${formatTime(hours[key].close)}`,
      hours,
    };
  }

  if (!accepting) {
    return { open: false, label: "Closed", detail: "Temporarily closed by the store", hours };
  }

  return { open: false, label: "Closed", detail: nextOpening(hours, now), hours };
}

/** Whether the store may appear publicly at all — mirrors the RLS policy. */
export function isMarketplaceVisible(store: {
  verification_status?: StoreVerificationStatus | null;
  is_approved?: boolean | null;
  is_active?: boolean | null;
  wallet_hold?: boolean | null;
}) {
  return (
    store.verification_status === "verified" &&
    store.is_approved !== false &&
    store.is_active !== false &&
    store.wallet_hold !== true
  );
}
