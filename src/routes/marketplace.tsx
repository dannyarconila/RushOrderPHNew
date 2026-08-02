import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";
import { PageHero, PublicLayout } from "@/components/site/public-layout";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — Shop local stores | RushOrder PH" },
      {
        name: "description",
        content:
          "Browse every RushOrder PH partner store — food, groceries, pharmacy and errands. No account needed to browse and search.",
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
        description="Browse stores, search products and compare prices freely — sign in only when you're ready to check out."
      />
      <MarketplaceBrowser emptyLabel="No stores are open right now. Please check back shortly." />
    </PublicLayout>
  );
}
