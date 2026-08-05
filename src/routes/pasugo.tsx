import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Navigation } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { myAddressesQuery } from "@/lib/addresses";
import { createPasugoBooking, customerLatestPasugoOrderQuery } from "@/lib/pasugo";

export const Route = createFileRoute("/pasugo")({
  head: () => ({
    meta: [
      { title: "Book a rider — Pasugo | RushOrder PH" },
      {
        name: "description",
        content:
          "Create a standalone Pasugo booking and find nearby RushOrder PH riders in real time.",
      },
    ],
  }),
  component: PasugoPage,
});

function PasugoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const addresses = useQuery(myAddressesQuery(user?.id));
  const latest = useQuery(customerLatestPasugoOrderQuery(user?.id));

  const defaultAddress = addresses.data?.[0];

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState(defaultAddress?.phone ?? "");
  const [pickupAddress, setPickupAddress] = useState(defaultAddress?.line1 ?? "");
  const [dropoffAddress, setDropoffAddress] = useState("");
  const [pickupLat, setPickupLat] = useState(
    defaultAddress?.latitude ? String(defaultAddress.latitude) : "",
  );
  const [pickupLng, setPickupLng] = useState(
    defaultAddress?.longitude ? String(defaultAddress.longitude) : "",
  );
  const [dropoffLat, setDropoffLat] = useState("");
  const [dropoffLng, setDropoffLng] = useState("");
  const [notes, setNotes] = useState("");

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) {
        navigate({ to: "/login", search: { next: "/pasugo" }, replace: true });
        throw new Error("Sign in required.");
      }
      if (!pickupAddress.trim() || !dropoffAddress.trim()) {
        throw new Error("Pickup and drop-off addresses are required.");
      }

      const parseNum = (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      return createPasugoBooking({
        userId: user.id,
        customerName,
        customerPhone,
        pickupAddress,
        dropoffAddress,
        pickupLat: parseNum(pickupLat),
        pickupLng: parseNum(pickupLng),
        dropoffLat: parseNum(dropoffLat),
        dropoffLng: parseNum(dropoffLng),
        notes,
      });
    },
    onSuccess: (orderId) => {
      toast.success("Finding nearby riders now");
      navigate({ to: "/order/$orderId", params: { orderId } });
    },
    onError: (error: Error) =>
      toast.error("Could not create booking", { description: error.message }),
  });

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Pasugo / Errands
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Book a rider (standalone)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This booking is independent from marketplace orders. We will immediately search nearby
          riders.
        </p>

        {latest.data && ["ready", "picked_up"].includes(latest.data.status) ? (
          <div className="mt-5 rounded-2xl border border-primary/30 bg-primary-soft p-4">
            <p className="text-sm font-semibold text-primary">You have an active Pasugo booking.</p>
            <Button asChild className="mt-3" size="sm" variant="outline">
              <Link to="/order/$orderId" params={{ orderId: latest.data.id }}>
                Continue tracking
              </Link>
            </Button>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer name">
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Customer phone">
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="09XX XXX XXXX"
              />
            </Field>
            <Field label="Pickup address">
              <Input
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Street / landmark"
              />
            </Field>
            <Field label="Drop-off address">
              <Input
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Street / landmark"
              />
            </Field>
            <Field label="Pickup latitude">
              <Input
                value={pickupLat}
                onChange={(e) => setPickupLat(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Pickup longitude">
              <Input
                value={pickupLng}
                onChange={(e) => setPickupLng(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Destination latitude">
              <Input
                value={dropoffLat}
                onChange={(e) => setDropoffLat(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Destination longitude">
              <Input
                value={dropoffLng}
                onChange={(e) => setDropoffLng(e.target.value)}
                placeholder="Optional"
              />
            </Field>
          </div>
          <Field label="Notes / instructions" className="mt-4">
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Item details, who to contact, special instructions"
            />
          </Field>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Finding riders...
                </>
              ) : (
                <>
                  <Navigation className="size-4" /> Book a rider now
                </>
              )}
            </Button>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
