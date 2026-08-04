import { createFileRoute, Link } from "@tanstack/react-router";

import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";
import { PageHero, PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — Shop local stores | RushOrder PH" },
      {
        name: "description",
        content:
          "Browse every RushOrder PH partner store — food, groceries, pharmacy and errands with your RushOrder PH account.",
      },
      { property: "og:title", content: "RushOrder PH Marketplace" },
      {
        property: "og:description",
        content: "Browse and search local stores and products across the Philippines.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MarketplacePage,
});

function MarketplacePage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Marketplace"
        title="Shop every RushOrder partner in one place"
        description="Browse stores, search products and compare prices using your RushOrder PH account."
      >
        <Button asChild variant="outline" className="border-ink-foreground/30 bg-transparent">
          <Link to="/errands">Run Errands/Pasugo</Link>
        </Button>
      </PageHero>
      <MarketplaceBrowser emptyLabel="No stores are open right now. Please check back shortly." />
    </PublicLayout>
  );
}
