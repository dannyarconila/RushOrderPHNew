import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Navigation, Route as RouteIcon, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { TextAreaField, TextField } from "@/components/forms/wizard";
import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { myAddressesQuery } from "@/lib/addresses";
import { createPasugoBooking, customerLatestPasugoQuery } from "@/lib/pasugo";
import { dispatchSettingsQuery, quoteDispatchFee } from "@/lib/dispatch";
import { geocodeAddressFn, reverseGeocodeFn } from "@/lib/geocoding.functions";
import { peso } from "@/lib/currency";

export const Route = createFileRoute("/pasugo/")({
  head: () => ({
    meta: [
      { title: "Book a rider — Pasugo | RushOrder PH" },
      {
        name: "description",
        content: "Request a RushOrder PH rider for a task from your current location.",
      },
    ],
  }),
  component: PasugoPage,
});

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  return Math.round(6371 * 2 * Math.asin(Math.sqrt(a)) * 100) / 100;
}

function PasugoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const addresses = useQuery(myAddressesQuery(user?.id));
  const latest = useQuery(customerLatestPasugoQuery(user?.id));
  const dispatchSettings = useQuery(dispatchSettingsQuery());

  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [destinationPlace, setDestinationPlace] = useState("");
  const [pickupAddress, setPickupAddress] = useState("");
  const [pickupCoords, setPickupCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [destinationCoords, setDestinationCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const distanceKm = useMemo(() => {
    if (!pickupCoords || !destinationCoords) return null;

    return haversineKm(
      pickupCoords.lat,
      pickupCoords.lng,
      destinationCoords.lat,
      destinationCoords.lng,
    );
  }, [destinationCoords, pickupCoords]);

  const estimatedFee = useMemo(() => {
    if (distanceKm == null || !dispatchSettings.data) return null;

    return quoteDispatchFee(distanceKm, dispatchSettings.data);
  }, [dispatchSettings.data, distanceKm]);

  const locatePickup = async () => {
    if (!navigator.geolocation) {
      throw new Error("Location services are not supported by this browser.");
    }

    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 30_000,
      });
    }).catch((error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        throw new Error("Please allow location access to use your current location.");
      }

      if (error.code === error.TIMEOUT) {
        throw new Error("Location request timed out. Please try again with GPS enabled.");
      }

      throw new Error("We couldn't determine your current location. Please try again.");
    });

    const coords = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    let address = "Current location";

    try {
      const reverse = await reverseGeocodeFn({
        data: {
          latitude: coords.lat,
          longitude: coords.lng,
        },
      });

      if (reverse?.address) {
        address = [
          reverse.address.line1,
          reverse.address.barangay,
          reverse.address.city,
          reverse.address.province,
          reverse.address.postal_code,
        ]
          .filter(Boolean)
          .join(", ");
      }
    } catch (error) {
      console.warn("Pasugo reverse geocoding failed:", error);
    }

    setPickupCoords(coords);
    setPickupAddress(address);

    return {
      coords,
      address,
    };
  };

  const findDestination = useMutation({
    mutationFn: async () => {
      const value = destination.trim();

      if (value.length < 5) {
        throw new Error("Enter a complete destination address.");
      }

      const result = await geocodeAddressFn({
        data: {
          line1: value,
          barangay: "",
          city: "",
          province: "",
          postal_code: "",
        },
      });

      const coords = {
        lat: result.latitude,
        lng: result.longitude,
      };

      setDestinationCoords(coords);
      setDestinationPlace(result.place_name);

      if (!pickupCoords) {
        await locatePickup();
      }

      return result;
    },
    onError: (error: Error) => {
      toast.error("Could not find destination", {
        description: error.message,
      });
    },
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!user) {
        navigate({
          to: "/login",
          search: { next: "/pasugo" },
          replace: true,
        });

        throw new Error("Sign in required.");
      }

      if (!destination.trim()) {
        throw new Error("Enter where you want the rider to go.");
      }

      if (!notes.trim()) {
        throw new Error("Tell the rider what you need done.");
      }

      let pickup = pickupCoords;
      let pickupText = pickupAddress;

      if (!pickup) {
        const located = await locatePickup();
        pickup = located.coords;
        pickupText = located.address;
      }

      if (!destinationCoords) {
        throw new Error("Please find your destination first.");
      }

      const address = addresses.data?.[0];

      const profileName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        address?.recipient_name ??
        "Customer";

      const phone = address?.phone ?? user.phone ?? "";

      return createPasugoBooking({
        userId: user.id,
        customerName: profileName,
        customerPhone: phone,
        pickupAddress: pickupText,
        dropoffAddress: destinationPlace || destination.trim(),
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: destinationCoords.lat,
        dropoffLng: destinationCoords.lng,
        notes: notes.trim(),
      });
    },
    onSuccess: (bookingId) => {
      toast.success("Pasugo request sent!", {
        description: "Finding an available rider near you.",
      });

      void navigate({
        to: "/pasugo/$bookingId",
        params: { bookingId },
      });
    },
    onError: (error: Error) =>
      toast.error("Could not create Pasugo request", {
        description: error.message,
      }),
  });

  const active =
    latest.data &&
    !["completed", "cancelled", "delivered"].includes(latest.data.status);

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Pasugo
        </p>

        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Request a Rider
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          Tell us where the rider needs to go and what you need done.
        </p>

        {active ? (
          <section className="mt-6 rounded-2xl border border-primary/30 bg-primary-soft p-5">
            <p className="font-semibold text-primary">
              You have an active Pasugo request.
            </p>

            <Button
              className="mt-3"
              variant="outline"
              onClick={() =>
                void navigate({
                  to: "/pasugo/$bookingId",
                  params: { bookingId: latest.data!.id },
                })
              }
            >
              Continue tracking
            </Button>
          </section>
        ) : null}

        <section className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <MapPin className="size-5" />
              </div>

              <div>
                <h2 className="font-display text-xl font-bold">
                  Where do you want the rider to go?
                </h2>

                <p className="text-xs text-muted-foreground">
                  Enter the destination for your Pasugo task.
                </p>
              </div>
            </div>

            <TextField
              className="mt-4"
              label="Destination address"
              value={destination}
              onChange={(value) => {
                setDestination(value);
                setDestinationCoords(null);
                setDestinationPlace("");
              }}
              placeholder="e.g. Jollibee Tagoloan, Misamis Oriental"
            />

            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full"
              onClick={() => findDestination.mutate()}
              disabled={
                findDestination.isPending ||
                destination.trim().length < 5
              }
            >
              {findDestination.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MapPin className="size-4" />
              )}

              {findDestination.isPending
                ? "Finding destination..."
                : "Find Destination"}
            </Button>

            {destinationPlace ? (
              <p className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs font-semibold">
                <span className="text-muted-foreground">
                  Located as:
                </span>{" "}
                {destinationPlace}
              </p>
            ) : null}
          </div>

          <TextAreaField
            label="What do you want the rider to do?"
            value={notes}
            onChange={setNotes}
            placeholder="e.g. Papalit ko Jollibee Tagoloan. Palihog palit ug 2-piece chicken meal."
            rows={4}
          />

          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex items-center gap-3">
              <Navigation className="size-5 text-primary" />

              <div>
                <p className="text-sm font-bold">Your current location</p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {pickupAddress ||
                    "We'll use your GPS location when finding the rider."}
                </p>
              </div>
            </div>
          </div>

          {distanceKm != null && estimatedFee != null ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <RouteIcon className="size-4" />
                  <span className="text-xs font-bold uppercase tracking-wide">
                    Distance
                  </span>
                </div>

                <p className="mt-2 text-2xl font-extrabold">
                  {distanceKm.toFixed(2)} km
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Pickup to destination
                </p>
              </div>

              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Wallet className="size-4" />
                  <span className="text-xs font-bold uppercase tracking-wide">
                    Delivery fee
                  </span>
                </div>

                <p className="mt-2 text-2xl font-extrabold">
                  {peso(estimatedFee)}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Based on current admin dispatch rates
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Find your destination to calculate the distance and current delivery fee.
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            onClick={() => book.mutate()}
            disabled={
              book.isPending ||
              findDestination.isPending ||
              !destinationCoords ||
              !pickupCoords ||
              !notes.trim() ||
              !dispatchSettings.data
            }
          >
            {book.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending request…
              </>
            ) : (
              <>
                <Navigation className="size-4" />
                Request Pasugo
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Your request will be offered to all eligible online riders within
            the configured dispatch radius. The first rider to accept gets the
            booking.
          </p>
        </section>
      </main>
    </PublicLayout>
  );
}
