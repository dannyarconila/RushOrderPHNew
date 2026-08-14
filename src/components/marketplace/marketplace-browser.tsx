import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Search, ShoppingBag, Star, Store as StoreIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCurrentLocation, isLocationSupported } from "@/lib/geolocation";

import { StorageImage } from "@/components/media/storage-image";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/use-auth";
import { myAddressesQuery } from "@/lib/addresses";
import { peso } from "@/lib/currency";
import {
  categoriesQuery,
  firstImage,
  publicSettingsQuery,
  productSearchQuery,
  storesQuery,
  type ServiceType,
} from "@/lib/marketplace";
import { storeAvailability } from "@/lib/store-status";
import { BUCKETS } from "@/lib/storage";
import { cn } from "@/lib/utils";

const toNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function MarketplaceBrowser({
  serviceType,
  emptyLabel = "No stores are open in this lane yet. Check back shortly.",
}: {
  serviceType?: ServiceType;
  emptyLabel?: string;
}) {
  const { user } = useAuth();

  const [term, setTerm] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [gpsCoords, setGpsCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const settings = useQuery(publicSettingsQuery());
  const addresses = useQuery(myAddressesQuery(user?.id));
  const categories = useQuery(categoriesQuery(serviceType));
  const products = useQuery(productSearchQuery(term, serviceType));
  useEffect(() => {
    if (!user) return;
    if (!isLocationSupported()) return;

    const preferred = (addresses.data ?? []).find((address) => address.is_default);

    const savedLat = toNumber(preferred?.latitude);
    const savedLng = toNumber(preferred?.longitude);

    // A saved default address with valid coordinates is the
    // authoritative delivery location for the customer.
    if (savedLat != null && savedLng != null) {
      setGpsCoords(null);
      setLocationError(null);
      return;
    }

    let cancelled = false;

    setIsDetectingLocation(true);
    setLocationError(null);

    getCurrentLocation()
      .then((coords) => {
        if (cancelled) return;

        setGpsCoords({
          lat: coords.latitude,
          lng: coords.longitude,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;

        const code =
          typeof error === "object" && error !== null && "code" in error
            ? Number((error as { code?: unknown }).code)
            : null;

        setLocationError(
          code === 1
            ? "Location permission was denied. Please allow location access to find stores near you."
            : "Could not detect your current location. You can continue browsing or set a delivery location at checkout.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsDetectingLocation(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, addresses.data]);

  const radiusKm = useMemo(() => {
    const raw = settings.data?.marketplace_customer_radius_km;
    const parsed = typeof raw === "number" ? raw : Number(raw);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [settings.data]);

  const preferredAddress = useMemo(() => {
    const list = addresses.data ?? [];

    return list.find((address) => address.is_default) ?? list[0] ?? null;
  }, [addresses.data]);

  const customerCoords = useMemo(() => {
    const savedLat = toNumber(preferredAddress?.latitude);
    const savedLng = toNumber(preferredAddress?.longitude);

    if (savedLat != null && savedLng != null) {
      return {
        lat: savedLat,
        lng: savedLng,
      };
    }

    return gpsCoords;
  }, [preferredAddress, gpsCoords]);

  const stores = useQuery(
    storesQuery(serviceType, customerCoords?.lat ?? null, customerCoords?.lng ?? null),
  );

  const locationRequired = Boolean(user) && Boolean(radiusKm) && !customerCoords;
  const detectCurrentLocation = async () => {
    if (!isLocationSupported()) {
      setLocationError("Location is not supported by this browser.");
      return;
    }

    setIsDetectingLocation(true);
    setLocationError(null);

    try {
      const coords = await getCurrentLocation();

      setGpsCoords({
        lat: coords.latitude,
        lng: coords.longitude,
      });
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? Number((error as { code?: unknown }).code)
          : null;

      setLocationError(
        code === 1
          ? "Location permission was denied. Please allow location access for RushOrder PH."
          : "Could not detect your current location. Please try again.",
      );
    } finally {
      setIsDetectingLocation(false);
    }
  };

  const visibleStores = stores.data ?? [];

  const results = useMemo(() => {
    const list = visibleStores;
    const needle = term.trim().toLowerCase();

    return list.filter((store) => {
      const matchesTerm =
        !needle ||
        store.name.toLowerCase().includes(needle) ||
        (store.description ?? "").toLowerCase().includes(needle);

      const matchesCategory = !category || store.category_id === category;

      return matchesTerm && matchesCategory;
    });
  }, [visibleStores, term, category]);

  const filteredProducts = useMemo(() => {
    const allowedStores = new Set(visibleStores.map((store) => store.id));

    return (products.data ?? []).filter((product) => allowedStores.has(product.store_id));
  }, [products.data, visibleStores]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search product"
            className="h-12 rounded-full pl-11"
            aria-label="Search stores and products"
          />
        </div>

        {categories.data && categories.data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <CategoryChip active={category === null} onClick={() => setCategory(null)}>
              All
            </CategoryChip>

            {categories.data.map((categoryItem) => (
              <CategoryChip
                key={categoryItem.id}
                active={category === categoryItem.id}
                onClick={() => setCategory(category === categoryItem.id ? null : categoryItem.id)}
              >
                {categoryItem.name}
              </CategoryChip>
            ))}
          </div>
        ) : null}
      </div>

      {locationRequired ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-muted/30 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Set your delivery location</p>

              <p className="mt-1 text-sm text-muted-foreground">
                RushOrder PH is showing stores within {radiusKm} km of your delivery location.
              </p>

              {locationError ? (
                <p className="mt-2 text-xs text-destructive">{locationError}</p>
              ) : isDetectingLocation ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Detecting your current location…
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={detectCurrentLocation}
              disabled={isDetectingLocation}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {isDetectingLocation ? "Detecting location…" : "Use my current location"}
            </button>
          </div>
        </div>
      ) : null}

      {term.trim().length >= 2 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold tracking-tight">Matching items</h2>

          {products.isLoading ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-28 rounded-2xl" />
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No products matched “{term.trim()}”.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {filteredProducts.map((product) => (
                <Link
                  key={product.id}
                  to="/store/$storeId"
                  params={{ storeId: product.store_id }}
                  className="flex gap-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-secondary">
                    <StorageImage
                      bucket={BUCKETS.productImages}
                      path={firstImage(product.images)}
                      alt={product.name}
                      className="size-full"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{product.name}</p>

                    <p className="truncate text-xs text-muted-foreground">{product.store?.name}</p>

                    <p className="mt-1 text-sm font-bold text-primary">
                      {peso(Number(product.price))}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <h2 className="mt-10 font-display text-lg font-bold tracking-tight">Stores</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stores.isLoading
          ? Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-56 rounded-2xl" />
            ))
          : results.map((store) => {
              const availability = storeAvailability(store);

              return (
                <Link
                  key={store.id}
                  to="/store/$storeId"
                  params={{ storeId: store.id }}
                  className="group overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
                >
                  <div className="relative h-32 bg-secondary">
                    {store.banner_url ? (
                      <StorageImage
                        bucket={BUCKETS.storeBanners}
                        path={store.banner_url}
                        alt={`${store.name} banner`}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <StoreIcon className="size-8" />
                      </div>
                    )}

                    {store.is_featured ? (
                      <span className="absolute left-3 top-3 rounded-full bg-accent px-3 py-1 text-[11px] font-bold text-accent-foreground">
                        Featured
                      </span>
                    ) : null}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-display text-base font-bold tracking-tight">
                        {store.name}
                      </h3>

                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-muted-foreground">
                        <Star className="size-3.5 fill-accent text-accent" />
                        {Number(store.rating ?? 0).toFixed(1)}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {store.description ?? "Local partner store on RushOrder PH."}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em]",
                          availability.open
                            ? "bg-success/15 text-success"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {availability.label}
                      </span>

                      {availability.detail ? (
                        <span className="text-xs text-muted-foreground">{availability.detail}</span>
                      ) : null}
                    </div>

                    <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <Clock3 className="size-3.5" />
                        {store.prep_time_minutes} min prep
                      </span>

                      <span className="inline-flex items-center gap-1.5">
                        <ShoppingBag className="size-3.5" />
                        Min. {peso(Number(store.minimum_order ?? 0))}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>

      {!stores.isLoading && results.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        </div>
      ) : null}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
