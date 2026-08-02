import { createFileRoute, Link } from "@tanstack/react-router";
import { HeartHandshake, Rocket, Users } from "lucide-react";

import { PageHero, PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About RushOrder PH — Our mission" },
      {
        name: "description",
        content:
          "RushOrder PH exists to give Filipino sellers a real storefront and riders a fair income, while customers shop local with confidence.",
      },
      { property: "og:title", content: "About RushOrder PH" },
      {
        property: "og:description",
        content: "Why we built a Filipino-first marketplace and delivery platform.",
      },
    ],
  }),
  component: AboutPage,
});

const PILLARS = [
  {
    icon: Users,
    title: "Local first",
    body: "We start in the barangay. Home-based sellers matter as much as registered enterprises, and both get a proper storefront.",
  },
  {
    icon: HeartHandshake,
    title: "Fair to riders",
    body: "Riders see the fee breakdown for every delivery, and payouts land in a wallet they control.",
  },
  {
    icon: Rocket,
    title: "Built to scale",
    body: "Verification, order routing and payouts are designed to work in one city and in fifty.",
  },
];

function AboutPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="About us"
        title="A marketplace built around Filipino sellers and riders"
        description="RushOrder PH started from a simple observation: most local commerce still happens in comment sections and chat threads. We are giving that energy real infrastructure."
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <p.icon className="size-5" />
              </span>
              <h2 className="mt-5 font-display text-lg font-bold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-14 grid gap-8 rounded-3xl border border-border bg-secondary/40 p-8 lg:grid-cols-2 lg:p-12">
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">Our mission</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              To make it as easy to run a business from a kitchen in Quezon City as it is to run one
              from a mall kiosk — and as easy to earn a fair delivery income as it is to catch a
              ride.
            </p>
          </div>
          <div>
            <h2 className="text-2xl font-extrabold sm:text-3xl">How we operate</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Every selling partner and rider is verified before going live. Documents live in
              private, encrypted storage and are reviewed by our operations team, never shared
              publicly.
            </p>
            <Button asChild className="mt-6">
              <Link to="/contact">Get in touch</Link>
            </Button>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
