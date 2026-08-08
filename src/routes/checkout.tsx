import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, MapPin, ShoppingBag, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import AddressLocationPicker from "@/components/maps/AddressLocationPicker";
import { TextAreaField, TextField } from "@/components/forms/wizard";
import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { useCart } from "@/contexts/cart-context";
import {
  EMPTY_ADDRESS,
  createAddress,
  formatAddress,
  myAddressesQuery,
  updateAddressLocation,
} from "@/lib/addresses";
import { peso } from "@/lib/currency";
import { dispatchSettingsQuery } from "@/lib/dispatch";
import { publicSettingsQuery, storeQuery } from "@/lib/marketplace";
import {
  clearOrderIdempotencyKey,
  getOrderIdempotencyKey,
  orderIntentSignature,
} from "@/lib/orders";
import { storeAvailability } from "@/lib/store-status";
import { placeOrder, quoteOrder, type PaymentMethod } from "@/lib/orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Checkout — RushOrder PH" },
      {
        name: "description",
        content:
          "Confirm your delivery address, choose cash or GCash, and place your RushOrder PH delivery order.",
      },
      { property: "og:title", content: "Checkout — RushOrder PH" },
      {
        property: "og:description",
        content: "Confirm your address and place your RushOrder PH delivery order.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CheckoutPage,
});

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: "cod", label: "Cash on delivery", hint: "Pay the rider when your order arrives." },
  { value: "gcash", label: "GCash", hint: "Pay online after placing the order." },
];

const toNumber = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

function CheckoutPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { lines, subtotal, storeId, storeName, clear } = useCart();

  const settings = useQuery(publicSettingsQuery());
  const dispatchSettings = useQuery({
    ...dispatchSettingsQuery(),
    enabled: Boolean(user),
  });
  const store = useQuery({ ...storeQuery(storeId ?? ""), enabled: Boolean(storeId) });
  const availability = store.data ? storeAvailability(store.data) : null;
  const storeClosed = Boolean(store.data) && availability?.open === false;
  const addresses = useQuery(myAddressesQuery(user?.id));

  const [addressId, setAddressId] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cod");
  const [notes, setNotes] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState(EMPTY_ADDRESS);
  const [editingAddressLocation, setEditingAddressLocation] = useState<string | null>(null);
  const [editingAddressCoords, setEditingAddressCoords] = useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const selectedAddress =
    (addresses.data ?? []).find((a) => a.id === addressId) ?? (addresses.data ?? [])[0] ?? null;
  const selectedAddressHasCoords =
    selectedAddress?.latitude != null && selectedAddress?.longitude != null;

  const distanceKm = useMemo(() => {
    const addressLat = toNumber(selectedAddress?.latitude);
    const addressLng = toNumber(selectedAddress?.longitude);

    const storeAddress =
      store.data?.address && typeof store.data.address === "object"
        ? (store.data.address as Record<string, unknown>)
        : null;
    const storeLat = toNumber(store.data?.latitude ?? storeAddress?.latitude);
    const storeLng = toNumber(store.data?.longitude ?? storeAddress?.longitude);

    if (storeLat == null || storeLng == null || addressLat == null || addressLng == null) {
      return 0;
    }

    return Math.max(
      0,
      Math.round(haversineKm(storeLat, storeLng, addressLat, addressLng) * 100) / 100,
    );
  }, [store.data, selectedAddress]);
  const feeSettings = useMemo(
    () => ({
      ...(settings.data ?? {}),
      ...(dispatchSettings.data
        ? {
            dispatch_fee_per_km: dispatchSettings.data.feePerKm,
            dispatch_min_fee: dispatchSettings.data.minFee,
            dispatch_max_fee: dispatchSettings.data.maxFee,
          }
        : {}),
    }),
    [settings.data, dispatchSettings.data],
  );

  const quote = useMemo(
    () =>
      quoteOrder({
        subtotal,
        distanceKm,
        settings: feeSettings,
        deliveryFeeOverride: store.data?.delivery_fee_override ?? null,
      }),
    [subtotal, distanceKm, feeSettings, store.data?.delivery_fee_override],
  );

  const intentSignature = useMemo(() => {
    if (!user || !storeId || !selectedAddress) return null;
    return orderIntentSignature({
      userId: user.id,
      storeId,
      addressId: selectedAddress.id,
      paymentMethod: payment,
      notes,
      lines: lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    });
  }, [user, storeId, selectedAddress, payment, notes, lines]);

  useEffect(() => {
    if (!intentSignature) {
      setIdempotencyKey("");
      return;
    }
    setIdempotencyKey(getOrderIdempotencyKey(intentSignature));
  }, [intentSignature]);

  const saveAddress = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in first.");
      if (draft.line1.trim().length < 4) throw new Error("Enter a complete street address.");
      if (draft.city.trim().length < 2) throw new Error("Enter your city or municipality.");
      if (draft.latitude == null || draft.longitude == null) {
        throw new Error("Enter the latitude and longitude for this address.");
      }
      return createAddress(user.id, draft);
    },
    onSuccess: (row) => {
      setAddressId(row.id);
      setShowNew(false);
      setDraft(EMPTY_ADDRESS);
      void queryClient.invalidateQueries({ queryKey: ["my-addresses"] });
      toast.success("Address saved");
    },
    onError: (error: Error) =>
      toast.error("Could not save address", { description: error.message }),
  });

  const updateAddressLocationMutation = useMutation({
  mutationFn: async ({
    addressId,
    latitude,
    longitude,
  }: {
    addressId: string;
    latitude: number;
    longitude: number;
  }) => {
    if (!user) throw new Error("Please sign in first.");
    return updateAddressLocation(user.id, addressId, latitude, longitude);
  },
  onSuccess: (row) => {
    setAddressId(row.id);

    if (user) {
      queryClient.setQueryData(
        ["my-addresses", user.id],
        (current: typeof addresses.data) =>
          (current ?? []).map((address) => (address.id === row.id ? row : address)),
      );
    }

    void queryClient.invalidateQueries({
      queryKey: ["my-addresses", user?.id],
    });

    toast.success("Delivery location saved", {
      description: `${Number(row.latitude).toFixed(6)}, ${Number(row.longitude).toFixed(6)}`,
    });
  },
  onError: (error: Error) =>
    toast.error("Could not save delivery location", {
      description: error.message,
    }),
});

const submit = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in to place an order.");
      if (!storeId) throw new Error("Your cart is empty.");
      if (!selectedAddress) throw new Error("Add a delivery address first.");
      if (!selectedAddressHasCoords) {
        throw new Error("Your selected address is missing map coordinates.");
      }
      if (!idempotencyKey || !intentSignature) {
        throw new Error("Your order could not be created. Please try again.");
      }
      if (storeClosed) {
        throw new Error(
          availability?.detail
            ? `${storeName ?? "This store"} is closed. ${availability.detail}.`
            : `${storeName ?? "This store"} is closed right now.`,
        );
      }
      return placeOrder({
        storeId,
        addressId: selectedAddress.id,
        notes,
        paymentMethod: payment,
        idempotencyKey,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
    },
    onSuccess: (orderId) => {
      if (intentSignature) clearOrderIdempotencyKey(intentSignature);
      clear();
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      toast.success("Order placed", { description: "We've notified the store." });
      void navigate({ to: "/order/$orderId", params: { orderId } });
    },
    onError: (error: Error) => toast.error("Could not place order", { description: error.message }),
  });

  if (lines.length === 0) {
    return (
      <PublicLayout>
        <div className="mx-auto w-full max-w-2xl px-4 py-20 text-center">
          <ShoppingBag className="mx-auto size-10 text-muted-foreground" />
          <h1 className="mt-4 font-display text-2xl font-extrabold tracking-tight">
            Your cart is empty
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse partner stores and add items to start an order.
          </p>
          <Button asChild className="mt-6">
            <Link to="/marketplace">Browse stores</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Checkout
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Ordering from <span className="font-semibold text-foreground">{storeName}</span>
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <MapPin className="size-4 text-primary" /> Delivery address
              </h2>

              {!user && !loading ? (
                <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
                  <p className="text-sm text-muted-foreground">
                    Sign in or create an account to save your delivery address and place this order.
                    Your cart is kept.
                  </p>
                  <Button asChild size="sm" className="mt-3">
                    <Link to="/login" search={{ next: "/checkout" }}>
                      Sign in
                    </Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mt-4 flex flex-col gap-2">
                    {(addresses.data ?? []).map((address) => {
                      const active = selectedAddress?.id === address.id;
                      return (
                        <button
                          key={address.id}
                          type="button"
                          onClick={() => {
                        setAddressId(address.id);
                        setEditingAddressLocation(address.id);
                        setEditingAddressCoords({
                          lat: address.latitude != null ? Number(address.latitude) : null,
                          lng: address.longitude != null ? Number(address.longitude) : null,
                        });
                      }}
                          className={cn(
                            "rounded-xl border p-4 text-left transition-colors",
                            active
                              ? "border-primary bg-primary-soft"
                              : "border-border hover:bg-secondary",
                          )}
                        >
                          <p className="text-sm font-bold">
                            {address.label ?? "Address"} · {address.recipient_name ?? ""}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatAddress(address)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {showNew ? (
                    <div className="mt-4 grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
                      <TextField
                        label="Label"
                        value={draft.label}
                        onChange={(v) => setDraft((d) => ({ ...d, label: v }))}
                      />
                      <TextField
                        label="Recipient name"
                        value={draft.recipient_name}
                        onChange={(v) => setDraft((d) => ({ ...d, recipient_name: v }))}
                      />
                      <TextField
                        label="Phone"
                        value={draft.phone}
                        onChange={(v) => setDraft((d) => ({ ...d, phone: v }))}
                      />
                      <TextField
                        label="Street address"
                        value={draft.line1}
                        onChange={(v) => setDraft((d) => ({ ...d, line1: v }))}
                      />
                      <TextField
                        label="Barangay"
                        value={draft.barangay}
                        onChange={(v) => setDraft((d) => ({ ...d, barangay: v }))}
                      />
                      <TextField
                        label="City / municipality"
                        value={draft.city}
                        onChange={(v) => setDraft((d) => ({ ...d, city: v }))}
                      />
                      <TextField
                        label="Province"
                        value={draft.province}
                        onChange={(v) => setDraft((d) => ({ ...d, province: v }))}
                      />
                      <TextField
                        label="Postal code"
                        value={draft.postal_code}
                        onChange={(v) => setDraft((d) => ({ ...d, postal_code: v }))}
                      />
                      <TextField
                        label="Latitude"
                        value={draft.latitude == null ? "" : String(draft.latitude)}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            latitude: v.trim() === "" ? null : Number(v),
                          }))
                        }
                      />
                      <TextField
                        label="Longitude"
                        value={draft.longitude == null ? "" : String(draft.longitude)}
                        onChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            longitude: v.trim() === "" ? null : Number(v),
                          }))
                        }
                      />
                      <div className="sm:col-span-2 flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveAddress.mutate()}
                          disabled={saveAddress.isPending}
                        >
                          {saveAddress.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : null}
                          Save address
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setShowNew(true)}
                    >
                      Add a new address
                    </Button>
                  )}
              {selectedAddress && !selectedAddressHasCoords ? (
                <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-4">
                  <p className="text-sm font-bold">Set delivery location</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    This address needs a map location before you can place the order. Tap the map,
                    drag the pin, or use your current location.
                  </p>

                  <div className="mt-4">
                    <AddressLocationPicker
                      latitude={editingAddressCoords.lat}
                      longitude={editingAddressCoords.lng}
                      onChange={(coordinate) =>
                        setEditingAddressCoords({
                          lat: coordinate.lat,
                          lng: coordinate.lng,
                        })
                      }
                    />
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (
                          editingAddressLocation &&
                          editingAddressCoords.lat != null &&
                          editingAddressCoords.lng != null
                        ) {
                          updateAddressLocationMutation.mutate({
                            addressId: editingAddressLocation,
                            latitude: editingAddressCoords.lat,
                            longitude: editingAddressCoords.lng,
                          });
                        }
                      }}
                      disabled={
                        updateAddressLocationMutation.isPending ||
                        editingAddressLocation == null ||
                        editingAddressCoords.lat == null ||
                        editingAddressCoords.lng == null
                      }
                    >
                      {updateAddressLocationMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <MapPin className="size-4" />
                      )}
                      Save delivery location
                    </Button>
                  </div>
                </div>
              ) : null}
                </>
              )}
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
              <h2 className="flex items-center gap-2 font-display text-base font-bold">
                <Wallet className="size-4 text-primary" /> Payment method
              </h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPayment(option.value)}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      payment === option.value
                        ? "border-primary bg-primary-soft"
                        : "border-border hover:bg-secondary",
                    )}
                  >
                    <p className="text-sm font-bold">{option.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{option.hint}</p>
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <TextAreaField
                  label="Order notes (optional)"
                  value={notes}
                  onChange={setNotes}
                  placeholder="Landmarks, gate codes, or preparation requests."
                />
              </div>
            </section>
          </div>

          <aside className="h-fit rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] lg:sticky lg:top-24">
            <h2 className="font-display text-base font-bold">Order summary</h2>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {lines.map((line) => (
                <li key={line.productId} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {line.quantity} × {line.name}
                  </span>
                  <span className="font-semibold">{peso(line.price * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm">
              <Row label="Subtotal" value={peso(quote.subtotal)} />
              <Row label="Delivery fee" value={peso(quote.deliveryFee)} />
              {quote.surgeFee > 0 ? <Row label="Surge" value={peso(quote.surgeFee)} /> : null}
              {quote.tax > 0 ? <Row label="Tax" value={peso(quote.tax)} /> : null}
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm font-bold">Total</span>
              <span className="font-display text-xl font-extrabold">{peso(quote.total)}</span>
            </div>
            {storeClosed ? (
              <p className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs font-semibold text-warning-foreground">
                {storeName ?? "This store"} is closed right now.
                {availability?.detail ? ` ${availability.detail}.` : ""} You can keep your cart and
                order once it opens.
              </p>
            ) : null}
            <Button
              block
              className="mt-5"
              disabled={submit.isPending || !user || !selectedAddress || storeClosed}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {storeClosed ? "Store closed" : "Place order"}
            </Button>

            <p className="mt-2 text-center text-xs text-muted-foreground">
              Final pricing and stock are validated when you submit the order.
            </p>
          </aside>
        </div>
      </div>
    </PublicLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
