import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { myAddressesQuery, formatAddress } from "@/lib/addresses";
import { createPasugoBooking, customerLatestPasugoQuery } from "@/lib/pasugo";
import { reverseGeocodeFn } from "@/lib/geocoding.functions";

export const Route = createFileRoute("/pasugo/")({
  head: () => ({
    meta: [
      { title: "Book a rider — Pasugo | RushOrder PH" },
      {
        name: "description",
        content: "Book an online RushOrder PH rider from your current location.",
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

  const book = useMutation({
    mutationFn: async () => {
      if (!user) {
        navigate({ to: "/login", search: { next: "/pasugo" }, replace: true });
        throw new Error("Sign in required.");
      }
      if (!navigator.geolocation)
        throw new Error("Location services are not supported by this browser.");

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15_000,
          maximumAge: 30_000,
        });
      }).catch((error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED)
          throw new Error("Please allow location access to book a rider.");
        if (error.code === error.TIMEOUT)
          throw new Error(
            "Location request timed out. Please try again outdoors or with GPS enabled.",
          );
        throw new Error("We couldn't determine your current location. Please try again.");
      });

      const address = addresses.data?.[0];
      const profileName =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        address?.recipient_name ??
        "Customer";
      const phone = address?.phone ?? (user.phone || "");

      let pickupAddress = "Current location";
      try {
        const reverse = await reverseGeocodeFn({
          data: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });

        if (reverse?.address) {
          pickupAddress = [
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
      return createPasugoBooking({
        userId: user.id,
        customerName: profileName,
        customerPhone: phone,
        pickupAddress,
        dropoffAddress: pickupAddress,
        pickupLat: position.coords.latitude,
        pickupLng: position.coords.longitude,
      });
    },
    onSuccess: (bookingId) => {
      toast.success("Choose a rider for your Pasugo booking.");
      void navigate({ to: "/pasugo/$bookingId", params: { bookingId } });
    },
    onError: (error: Error) =>
      toast.error("Could not create booking", { description: error.message }),
  });

  const active =
    latest.data && !["completed", "cancelled", "delivered"].includes(latest.data.status);
  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Pasugo</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Book a Rider
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Use your current location to find available riders near you.
        </p>
        {active ? (
          <section className="mt-6 rounded-2xl border border-primary/30 bg-primary-soft p-5">
            <p className="font-semibold text-primary">You have an active Pasugo booking.</p>
            <Button
              className="mt-3"
              variant="outline"
              onClick={() =>
                void navigate({ to: "/pasugo/$bookingId", params: { bookingId: latest.data!.id } })
              }
            >
              Continue tracking
            </Button>
          </section>
        ) : null}
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary-soft text-primary">
            <MapPin className="size-5" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold">Ready when you are</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            We'll securely use your current GPS location and saved account details. No booking form
            is needed.
          </p>
          <Button
            className="mt-6 w-full"
            size="lg"
            onClick={() => book.mutate()}
            disabled={book.isPending}
          >
            {book.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Getting your location…
              </>
            ) : (
              <>
                <Navigation className="size-4" /> Book a Rider
              </>
            )}
          </Button>
        </section>
      </main>
    </PublicLayout>
  );
}
