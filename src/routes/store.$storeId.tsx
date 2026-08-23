import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Heart, Minus, Plus, Star, Store as StoreIcon } from "lucide-react";
import { toast } from "sonner";

import { StorageImage } from "@/components/media/storage-image";
import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/use-auth";
import { useCart } from "@/contexts/cart-context";
import { peso } from "@/lib/currency";
import { favoriteStoresQuery, toggleFavoriteStore } from "@/lib/favorites";
import { storeProductsQuery, storeQuery, firstImage } from "@/lib/marketplace";
import { storeAvailability } from "@/lib/store-status";
import { BUCKETS } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/store/$storeId")({
  head: () => ({
    meta: [
      { title: "Partner Store — RushOrder PH" },
      {
        name: "description",
        content:
          "Browse the menu and products of this verified RushOrder PH partner store and order for rush delivery.",
      },
      { property: "og:title", content: "Partner Store — RushOrder PH" },
      {
        property: "og:description",
        content: "Browse products from this verified RushOrder PH partner store.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StorePage,
});

function StorePage() {
  const { storeId } = Route.useParams();
  const store = useQuery(storeQuery(storeId));
  const products = useQuery(storeProductsQuery(storeId));
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const favorites = useQuery(favoriteStoresQuery(user?.id));
  const isFavorite = (favorites.data ?? []).includes(storeId);

  const favorite = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sign in to save favourites.");
      await toggleFavoriteStore(user.id, storeId, isFavorite);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorite-stores"] });
      toast.success(isFavorite ? "Removed from favourites" : "Saved to favourites");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const { add, lines, setQuantity } = useCart();
  const availability = store.data ? storeAvailability(store.data) : null;
  const storeOpen = Boolean(availability?.open);

  return (
    <PublicLayout>
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to marketplace
        </Link>

        {store.isLoading ? (
          <Skeleton className="mt-6 h-48 rounded-2xl" />
        ) : store.data ? (
          <header className="mt-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
            <div className="h-56 bg-secondary sm:h-64">
              <StorageImage
                bucket={BUCKETS.storeBanners}
                path={store.data.banner_url}
                alt={`${store.data.name} banner`}
                className="size-full"
                fallback={
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <StoreIcon className="size-10" />
                  </div>
                }
              />
            </div>
            <div className="flex flex-col gap-2 p-6">
              <div className="flex items-start justify-between gap-4">
                <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                  {store.data.name}
                </h1>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => favorite.mutate()}
                  disabled={favorite.isPending}
                  aria-pressed={isFavorite}
                >
                  <Heart className={cn("size-4", isFavorite && "fill-primary text-primary")} />
                  {isFavorite ? "Saved" : "Save"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {store.data.description ?? "Verified RushOrder PH partner store."}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-bold">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Star className="size-3.5 fill-accent text-accent" />
                  {Number(store.data.rating ?? 0).toFixed(1)} ({store.data.rating_count} reviews)
                </span>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 uppercase tracking-[0.12em]",
                    storeOpen ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {availability?.label ?? "Closed"}
                </span>
                {availability?.detail ? (
                  <span className="font-medium text-muted-foreground">{availability.detail}</span>
                ) : null}
              </div>
            </div>
          </header>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">This store isn't available right now.</p>
          </div>
        )}

        <h2 className="mt-10 font-display text-lg font-bold tracking-tight">Products</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))
            : (products.data ?? []).map((p) => {
                const line = lines.find((l) => l.productId === p.id);
                const soldOut = !p.is_available || p.stock <= 0;
                return (
                  <article
                    key={p.id}
                    className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]"
                  >
                    <div className="h-52 bg-secondary sm:h-60">
                      <StorageImage
                        bucket={BUCKETS.productImages}
                        path={firstImage(p.images)}
                        alt={p.name}
                        className="size-full"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="font-semibold">{p.name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {p.description}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="font-display text-lg font-extrabold">
                          {peso(Number(p.price))}
                        </span>
                        <span className="text-xs font-semibold text-muted-foreground">
                          {soldOut ? "Unavailable" : `${p.stock} in stock`}
                        </span>
                      </div>

                      <div className="mt-4">
                        {line ? (
                          <div className="flex items-center justify-between rounded-xl border border-border px-2 py-1.5">
                            <button
                              type="button"
                              aria-label={`Decrease ${p.name}`}
                              onClick={() => setQuantity(p.id, line.quantity - 1)}
                              className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-secondary"
                            >
                              <Minus className="size-4" />
                            </button>
                            <span className="text-sm font-bold">{line.quantity} in cart</span>
                            <button
                              type="button"
                              aria-label={`Increase ${p.name}`}
                              disabled={line.quantity >= p.stock}
                              onClick={() => setQuantity(p.id, line.quantity + 1)}
                              className="inline-flex size-8 items-center justify-center rounded-lg hover:bg-secondary disabled:opacity-40"
                            >
                              <Plus className="size-4" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            block
                            size="sm"
                            disabled={soldOut || !storeOpen || !store.data}
                            onClick={() =>
                              store.data &&
                              add({
                                productId: p.id,
                                storeId: store.data.id,
                                storeName: store.data.name,
                                name: p.name,
                                price: Number(p.price),
                                image: firstImage(p.images),
                                stock: p.stock,
                              })
                            }
                          >
                            {storeOpen ? "Add to cart" : "Store closed"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
        </div>

        {!products.isLoading && (products.data ?? []).length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              This partner hasn't published products yet.
            </p>
          </div>
        ) : null}
      </div>
    </PublicLayout>
  );
}
