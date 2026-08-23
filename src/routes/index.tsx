import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Bike,
  Clock3,
  MapPin,
  PackageCheck,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Store,
  Wallet,
} from "lucide-react";

import { PublicLayout } from "@/components/site/public-layout";
import { StorageImage } from "@/components/media/storage-image";
import { supabase } from "@/integrations/supabase/client";
import { BUCKETS } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { InstallAppButton } from "@/components/site/install-app-button";
import { firstImage } from "@/lib/marketplace";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RushOrder PH — Marketplace & Delivery for the Philippines" },
      {
        name: "description",
        content:
          "Shop local stores, sell online as a registered or home-based business, and earn as a rider. One Filipino marketplace and delivery platform.",
      },
      {
        property: "og:title",
        content: "RushOrder PH — Marketplace & Delivery for the Philippines",
      },
      {
        property: "og:description",
        content:
          "Shop local stores, sell online as a registered or home-based business, and earn as a rider. One Filipino marketplace and delivery platform.",
      },
    ],
  }),
  component: LandingPage,
});

const FEATURES = [
  {
    icon: ShoppingBasket,
    title: "One basket, many stores",
    body: "Browse verified local stores and home-based sellers in your barangay, all in a single marketplace.",
  },
  {
    icon: Clock3,
    title: "Rush delivery windows",
    body: "Same-hour delivery lanes designed around Philippine traffic, not imported logistics playbooks.",
  },
  {
    icon: ShieldCheck,
    title: "Verified partners",
    body: "Every selling partner and rider passes document and identity verification before going live.",
  },
  {
    icon: Wallet,
    title: "Transparent earnings",
    body: "Partner and rider wallets show payouts, fees and pending balances without hidden deductions.",
  },
];

const CATEGORIES = [
  "Food & Beverages",
  "Groceries",
  "Fashion & Apparel",
  "Health & Beauty",
  "Electronics",
  "Home & Living",
  "Baby & Kids",
  "Pabili & Errands",
];

type LandingStore = {
  id: string;
  name: string;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
};

type LandingProduct = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  images: unknown;
};

function LandingProductShowcase() {
  const storesQuery = useQuery({
    queryKey: ["landing-latest-partner-stores"],
    queryFn: async (): Promise<LandingStore[]> => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,logo_url,banner_url,created_at")
        .eq("is_active", true)
        .eq("is_visible", true)
        .eq("is_approved", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;

      return (data ?? []) as LandingStore[];
    },
    staleTime: 60_000,
  });

  const stores = storesQuery.data ?? [];

  return (
    <div className="relative">
      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 pr-2 touch-pan-x"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x",
        }}
      >
        {stores.map((store) => (
          <article
            key={store.id}
            className="w-[calc(100vw-3.5rem)] max-w-[28rem] shrink-0 snap-center overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 shadow-[var(--shadow-lifted)] sm:w-full"
          >
            <div className="relative h-[20rem] bg-black/20 sm:h-[24rem]">
              {store.banner_url ? (
                <StorageImage
                  bucket={BUCKETS.storeBanners}
                  path={store.banner_url}
                  alt={`${store.name} store banner`}
                  className="size-full object-cover"
                />
              ) : store.logo_url ? (
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/30 via-card/20 to-ink p-8">
                  <StorageImage
                    bucket={BUCKETS.storeLogos}
                    path={store.logo_url}
                    alt={`${store.name} logo`}
                    className="size-32 rounded-3xl object-cover"
                  />
                </div>
              ) : (
                <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/30 via-card/20 to-ink p-8 text-center">
                  <span className="text-2xl font-extrabold text-white">
                    {store.name}
                  </span>
                </div>
              )}

              <div className="absolute right-4 top-4 rounded-full bg-black/45 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
                Official partner
              </div>
            </div>

            <div className="bg-card p-5 sm:p-6">
              <span className="inline-flex rounded-full bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent-foreground">
                New official partner
              </span>

              <p className="mt-3 text-sm font-semibold text-ink-foreground/65">
                {store.name} is now an official partner of RushOrder PH
              </p>

              <h3 className="mt-2 text-2xl font-extrabold leading-tight text-ink sm:text-3xl">
                {store.name}
              </h3>

              <div className="mt-5">
                <Button asChild>
                  <Link
                    to="/store/$storeId"
                    params={{ storeId: store.id }}
                  >
                    Visit store
                    <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </article>
        ))}

        {stores.length === 0 && !storesQuery.isLoading ? (
          <div className="flex min-h-[20rem] w-full items-center justify-center rounded-[2rem] border border-white/10 bg-black/20 p-8 text-center text-white/70">
            New RushOrder PH partners will appear here.
          </div>
        ) : null}
      </div>

      {stores.length > 1 ? (
        <p className="mt-2 text-center text-xs text-white/50">
          Swipe to see more partners →
        </p>
      ) : null}
    </div>
  );
}


function LandingProductDiscovery() {
  const productsQuery = useQuery({
    queryKey: ["landing-product-discovery"],
    queryFn: async (): Promise<Array<LandingProduct & { store_name: string }>> => {
      const { data: stores, error: storesError } = await supabase
        .from("stores")
        .select("id,name")
        .eq("is_active", true)
        .eq("is_visible", true)
        .eq("is_approved", true)
        .is("deleted_at", null);

      if (storesError) throw storesError;

      const storeIds = (stores ?? []).map((store) => store.id);

      if (storeIds.length === 0) return [];

      const storeMap = new Map(
        (stores ?? []).map((store) => [store.id, store.name]),
      );

      const { data, error } = await supabase
        .from("products")
        .select("id,store_id,name,price,images,created_at")
        .in("store_id", storeIds)
        .eq("is_published", true)
        .eq("is_available", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      return (data ?? [])
        .map((product) => ({
          id: product.id,
          store_id: product.store_id,
          name: product.name,
          price: Number(product.price),
          images: product.images,
          store_name: storeMap.get(product.store_id) ?? "RushOrder PH Partner",
        }))
        .filter((product) => Boolean(product.store_name));
    },
    staleTime: 60_000,
  });

  const products = productsQuery.data ?? [];

  return (
    <section className="border-y border-border bg-secondary/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
              Shop local
            </p>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">
              Fresh from our partners
            </h2>
          </div>

          {products.length > 3 ? (
            <span className="shrink-0 text-xs font-semibold text-muted-foreground">
              Swipe for more →
            </span>
          ) : null}
        </div>

        {products.length > 0 ? (
          <div
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain pb-3 touch-pan-x"
            style={{
              scrollbarWidth: "none",
              WebkitOverflowScrolling: "touch",
              touchAction: "pan-x",
            }}
          >
            {products.map((product) => (
              <Link
                key={product.id}
                to="/store/$storeId"
                params={{ storeId: product.store_id }}
                className="w-[calc((100vw-4rem)/1.35)] min-w-[15rem] max-w-[20rem] shrink-0 snap-start overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-1 sm:w-[18rem] lg:w-[20rem]"
              >
                <div className="h-52 bg-secondary sm:h-56">
                  <StorageImage
                    bucket={BUCKETS.productImages}
                    path={firstImage(product.images)}
                    alt={product.name}
                    className="size-full object-cover"
                  />
                </div>

                <div className="p-4">
                  <p className="truncate text-xs font-semibold text-primary">
                    {product.store_name}
                  </p>

                  <h3 className="mt-1 truncate text-base font-extrabold">
                    {product.name}
                  </h3>

                  <p className="mt-2 text-lg font-extrabold">
                    ₱{product.price.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
            New products from RushOrder PH partners will appear here.
          </div>
        )}
      </div>
    </section>
  );
}

function LandingPage() {
  return (
    <PublicLayout>
      <section className="surface-hero relative overflow-hidden text-ink-foreground">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-foreground/20 bg-ink-foreground/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-accent">
              <Sparkles className="size-3.5" /> Marketplace + Delivery
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
              RushOrder PH
            </h1>
<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg">
                <Link to="/marketplace">
                  Start shopping <ArrowRight className="size-4" />
                </Link>
              </Button>

              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-ink-foreground/25 bg-transparent text-ink-foreground hover:bg-ink-foreground/10"
              >
                <Link to="/errands">Run Errands/Pasugo</Link>
              </Button>

              <InstallAppButton />
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-ink-foreground/70">

            </div>
          </div>

          <LandingProductShowcase />
        </div>
      </section>

      <LandingProductDiscovery />

      <section className="border-y border-border bg-secondary/50">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-3xl font-extrabold sm:text-4xl">Marketplace categories</h2>
            <p className="text-sm text-muted-foreground">
              Launching with eight core categories, more each sprint.
            </p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((cat) => (
              <div
                key={cat}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-soft)]"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-accent/20 text-accent-foreground">
                  <MapPin className="size-4" />
                </span>
                <span className="text-sm font-semibold">{cat}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-24">
        <article className="flex flex-col justify-between rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]">
          <div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Store className="size-6" />
            </span>
            <h2 className="mt-6 text-2xl font-extrabold sm:text-3xl">Become a selling partner</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Whether you run a registered business with a DTI or SEC permit, or you cook and craft
              from home, there is an onboarding path built for you. Submit your documents once and
              track your application status in real time.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
              <li>• Registered business: permits, owner details and business address</li>
              <li>• Home-based seller: government ID, selfie check and pickup address</li>
            </ul>
          </div>
          <Button asChild className="mt-8 self-start">
            <Link to="/become-seller">
              Apply as a partner <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>

        <article className="flex flex-col justify-between rounded-3xl border border-border bg-ink p-8 text-ink-foreground shadow-[var(--shadow-lifted)]">
          <div>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent/20 text-accent">
              <Bike className="size-6" />
            </span>
            <h2 className="mt-6 text-2xl font-extrabold sm:text-3xl">Become a rider</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-foreground/75">
              Ride your own hours across your city. Complete a professional onboarding with vehicle
              details, licence and emergency contact, then track your approval from the rider
              dashboard.
            </p>
            <ul className="mt-5 space-y-2 text-sm text-ink-foreground/70">
              <li>• Motorcycle, bicycle, tricycle, car or van</li>
              <li>• Weekly wallet payouts and clear earnings history</li>
            </ul>
          </div>
          <Button asChild variant="ember" className="mt-8 self-start">
            <Link to="/become-rider">
              Apply as a rider <ArrowRight className="size-4" />
            </Link>
          </Button>
        </article>
      </section>

      <section className="border-t border-border bg-primary-soft/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-start gap-6 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <h2 className="text-3xl font-extrabold sm:text-4xl">Ready to join RushOrder PH?</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Create a free account in under a minute. Upgrade to a selling partner or rider any
              time.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/register">Create free account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/contact">Talk to our team</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
