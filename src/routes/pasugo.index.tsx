import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Navigation } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/use-auth";
import { myAddressesQuery } from "@/lib/addresses";
import { createPasugoBooking, customerLatestPasugoQuery } from "@/lib/pasugo";

export const Route = createFileRoute("/pasugo/")({
  head: () => ({
    meta: [
      { title: "Book a rider — Pasugo | RushOrder PH" },
      {
        name: "description",
        content:
          "Book an online RushOrder PH rider using your name, contact number and current location.",
      },
    ],
  }),
  component: PasugoPage,
});

function PasugoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const addresses = useQuery(myAddressesQuery(user?.id));
  const latest = useQuery(customerLatestPasugoQuery(user?.id));

  const defaultAddress = addresses.data?.[0];

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState(defaultAddress?.phone ?? "");
  const [location, setLocation] = useState(defaultAddress?.line1 ?? "");
  const [latitude, setLatitude] = useState<number | null>(
    defaultAddress?.latitude ?? null,
  );
  const [longitude, setLongitude] = useState<number | null>(
    defaultAddress?.longitude ?? null,
  );
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (defaultAddress?.phone && !customerPhone) {
      setCustomerPhone(defaultAddress.phone);
    }

    if (defaultAddress?.line1 && !location) {
      setLocation(defaultAddress.line1);
    }

    if (
      defaultAddress?.latitude != null &&
      defaultAddress?.longitude != null &&
      latitude == null &&
      longitude == null
    ) {
      setLatitude(defaultAddress.latitude);
      setLongitude(defaultAddress.longitude);
    }
  }, [
    defaultAddress,
    customerPhone,
    location,
    latitude,
    longitude,
  ]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Location is not supported", {
        description: "Please enter your location manually.",
      });
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        setLatitude(lat);
        setLongitude(lng);

        setLocation(
          `Current location (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
        );

        setLocating(false);
        toast.success("Current location detected");
      },
      (error) => {
        setLocating(false);

        toast.error("Could not get your location", {
          description:
            error.code === error.PERMISSION_DENIED
              ? "Please allow location access and try again."
              : "Please try again or enter your location manually.",
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 30000,
      },
    );
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!user) {
        navigate({
          to: "/login",
          search: { next: "/pasugo" },
          replace: true,
        });
        throw new Error("Sign in required.");
      }

      if (!customerName.trim()) {
        throw new Error("Customer name is required.");
      }

      if (!customerPhone.trim()) {
        throw new Error("Contact number is required.");
      }

      if (!location.trim()) {
        throw new Error("Location is required.");
      }

      if (latitude == null || longitude == null) {
        throw new Error("Please use your current location before booking.");
      }

      return createPasugoBooking({
        userId: user.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        pickupAddress: location.trim(),
        dropoffAddress: location.trim(),
        pickupLat: latitude,
        pickupLng: longitude,
        dropoffLat: latitude,
        dropoffLng: longitude,
      });
    },
    onSuccess: (bookingId) => {
      console.debug("Pasugo booking created:", { bookingId });

      toast.success("Finding nearby riders now");

      if (!bookingId) {
        toast.error("Booking created but tracking ID is missing.");
        return;
      }

      window.location.assign(`/pasugo/${encodeURIComponent(bookingId)}`);
    },
    onError: (error: Error) =>
      toast.error("Could not create booking", {
        description: error.message,
      }),
  });

  const canBook =
    customerName.trim().length > 0 &&
    customerPhone.trim().length > 0 &&
    location.trim().length > 0 &&
    latitude != null &&
    longitude != null &&
    !submit.isPending &&
    !locating;

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Pasugo
        </p>

        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Book a rider
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Enter your details and location. We will find an available online
          rider near you.
        </p>

        {latest.data &&
        !["completed", "cancelled", "delivered"].includes(latest.data.status) ? (
          <div className="mt-5 rounded-2xl border border-primary/30 bg-primary-soft p-4">
            <p className="text-sm font-semibold text-primary">
              You have an active Pasugo booking.
            </p>

            <p className="mt-1 text-sm text-muted-foreground">
              Status:{" "}
              <span className="font-semibold capitalize">
                {latest.data.status.replaceAll("_", " ")}
              </span>
            </p>

            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              onClick={() => {
                const bookingId = latest.data?.id;
                if (!bookingId) {
                  toast.error("Booking tracking ID is unavailable.");
                  return;
                }

                navigate({
                  to: "/pasugo/$bookingId",
                  params: { bookingId },
                });
              }}
            >
              Continue tracking
            </Button>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
          <div className="space-y-5">
            <Field label="Name" required>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                autoComplete="name"
                required
              />
            </Field>

            <Field label="Contact number" required>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="09XX XXX XXXX"
                inputMode="tel"
                autoComplete="tel"
                required
              />
            </Field>

            <Field label="Location" required>
              <div className="space-y-2">
                <Input
                  value={location}
                  onChange={(e) => {
                    setLocation(e.target.value);
                    setLatitude(null);
                    setLongitude(null);
                  }}
                  placeholder="Your current location"
                  required
                />

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={useCurrentLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Getting your location...
                    </>
                  ) : (
                    <>
                      <MapPin className="size-4" />
                      Use my current location
                    </>
                  )}
                </Button>

                {latitude != null && longitude != null ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-success">
                    <MapPin className="size-3.5" />
                    Location detected
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Current location is required to find nearby riders.
                  </p>
                )}
              </div>
            </Field>
          </div>

          <Button
            className="mt-7 w-full"
            size="lg"
            onClick={() => submit.mutate()}
            disabled={!canBook}
          >
            {submit.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Finding riders...
              </>
            ) : (
              <>
                <Navigation className="size-4" />
                Book a rider now
              </>
            )}
          </Button>
        </section>
      </main>
    </PublicLayout>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}{" "}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {children}
    </label>
  );
}
