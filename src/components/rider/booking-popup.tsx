/**
 * Live booking request popup.
 *
 * Shown to an online rider the moment dispatch offers them a job. The countdown
 * mirrors the server-side expiry; accepting races other riders through the
 * `dispatch_accept` lock, so a lost race simply closes the card.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bike, Clock, MapPin, Navigation } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { peso } from "@/lib/marketplace";
import { acceptDispatch, declineDispatch, secondsLeft, type OfferWithJob } from "@/lib/dispatch";

export function BookingPopup({ data, onClose }: { data: OfferWithJob; onClose: () => void }) {
  const { offer, job } = data;
  const queryClient = useQueryClient();
  const [remaining, setRemaining] = useState(() => secondsLeft(offer.expires_at));

  useEffect(() => {
    setRemaining(secondsLeft(offer.expires_at));
    const timer = window.setInterval(() => {
      const next = secondsLeft(offer.expires_at);
      setRemaining(next);
      if (next <= 0) {
        window.clearInterval(timer);
        onClose();
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [offer.expires_at, onClose]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["dispatch-offer"] });
    void queryClient.invalidateQueries({ queryKey: ["dispatch-active-job"] });
    void queryClient.invalidateQueries({ queryKey: ["rider-status"] });
  };

  const accept = useMutation({
    mutationFn: () => acceptDispatch(job.id),
    onSuccess: (result) => {
      if (result.ok) toast.success("Delivery assigned to you");
      else toast.info("Another rider accepted this booking first");
      refresh();
      onClose();
    },
    onError: (error: Error) => toast.error("Could not accept", { description: error.message }),
  });

  const decline = useMutation({
    mutationFn: () => declineDispatch(job.id),
    onSettled: () => {
      refresh();
      onClose();
    },
  });

  const total = Math.max(1, secondsLeft(offer.expires_at) || 30);
  const progress = Math.min(100, Math.max(0, (remaining / total) * 100));
  const busy = accept.isPending || decline.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-3 bg-primary px-5 py-4 text-primary-foreground">
          <span className="flex items-center gap-2 font-display text-lg font-extrabold">
            <Bike className="size-5" /> New booking
          </span>
          <span className="flex items-center gap-1 text-sm font-bold tabular-nums">
            <Clock className="size-4" /> {remaining}s
          </span>
        </div>

        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Delivery earnings
              </p>
              <p className="font-display text-3xl font-extrabold">
                {peso(Number(job.delivery_fee))}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {Number(job.distance_km).toFixed(1)} km trip
            </p>
          </div>

          <div className="space-y-3 rounded-2xl bg-muted/50 p-4">
            <Row
              icon={MapPin}
              label="Pick up"
              title={job.store_name ?? "Store"}
              detail={job.pickup_address}
            />
            <Row icon={Navigation} label="Drop off" title="Customer" detail={job.dropoff_address} />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              disabled={busy}
              onClick={() => decline.mutate()}
            >
              Decline
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => accept.mutate()}>
              {accept.isPending ? "Accepting…" : "Accept booking"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  title,
  detail,
}: {
  icon: typeof MapPin;
  label: string;
  title: string;
  detail: string | null;
}) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-background text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail ?? "Address shared after pickup"}</p>
      </div>
    </div>
  );
}
