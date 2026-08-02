import { BadgeCheck, Clock, PauseCircle, XCircle } from "lucide-react";

import {
  VERIFICATION_LABELS,
  VERIFICATION_TONES,
  type StoreVerificationStatus,
} from "@/lib/stores";
import { cn } from "@/lib/utils";

const ICONS = {
  pending: Clock,
  verified: BadgeCheck,
  suspended: PauseCircle,
  rejected: XCircle,
} as const;

export function VerificationBadge({
  status,
  className,
  compact,
}: {
  status: StoreVerificationStatus;
  className?: string;
  compact?: boolean;
}) {
  const Icon = ICONS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold",
        VERIFICATION_TONES[status],
        className,
      )}
      title={VERIFICATION_LABELS[status]}
    >
      <Icon className="size-3.5" />
      {compact ? null : VERIFICATION_LABELS[status]}
    </span>
  );
}
