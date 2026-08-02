import { createFileRoute, Link } from "@tanstack/react-router";
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

import heroRider from "@/assets/hero-rider.jpg";
import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";

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

const WHY = [
  { stat: "4 roles", label: "Customers, selling partners, riders and admins in one ecosystem." },
  {
    stat: "2 seller paths",
    label: "Registered businesses and home-based sellers each get their own flow.",
  },
  {
    stat: "100% verified",
    label: "Government ID, selfie and document checks stored in private, encrypted storage.",
  },
];

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
              Everything your <span className="text-ember">neighbourhood sells</span>, delivered in
              a rush.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-foreground/75 sm:text-lg">
              RushOrder PH is the Philippine platform where customers shop local, sellers grow
              beyond Facebook posts, and riders earn on their own schedule.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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
                <Link to="/become-seller">Sell on RushOrder</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-6 text-sm text-ink-foreground/70">
              {WHY.map((item) => (
                <div key={item.stat}>
                  <p className="font-display text-xl font-extrabold text-ink-foreground">
                    {item.stat}
                  </p>
                  <p className="max-w-[14rem] text-xs leading-relaxed">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <img
              src={heroRider}
              alt="RushOrder PH rider delivering an order along a sunlit Manila street"
              width={1600}
              height={1200}
              className="w-full rounded-3xl object-cover shadow-[var(--shadow-lifted)]"
            />
            <div className="absolute -bottom-5 left-5 flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-foreground shadow-[var(--shadow-lifted)]">
              <span className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success">
                <PackageCheck className="size-5" />
              </span>
              <div>
                <p className="text-sm font-bold">Order picked up</p>
                <p className="text-xs text-muted-foreground">Rider is 6 minutes away</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <h2 className="max-w-2xl text-3xl font-extrabold sm:text-4xl">
          Built for how Filipinos actually buy and sell
        </h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] transition-shadow hover:shadow-[var(--shadow-lifted)]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <feature.icon className="size-5" />
              </span>
              <h3 className="mt-5 font-display text-lg font-bold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

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
