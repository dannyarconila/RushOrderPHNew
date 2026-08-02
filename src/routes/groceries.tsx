import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";
import { PageHero, PublicLayout } from "@/components/site/public-layout";

export const Route = createFileRoute("/groceries")({
  head: () => ({
    meta: [
      { title: "Grocery Delivery — RushOrder PH" },
      {
        name: "description",
        content:
          "Shop sari-sari stores, wet markets and supermarkets near you and get groceries delivered the same hour.",
      },
      { property: "og:title", content: "Grocery Delivery — RushOrder PH" },
      {
        property: "og:description",
        content: "Sari-sari stores, wet markets and supermarkets delivered the same hour.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GroceriesPage,
});

function GroceriesPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Groceries"
        title="Sari-sari, palengke and supermarket runs"
        description="Everyday essentials from partner stores in your barangay."
      />
      <MarketplaceBrowser
        serviceType="groceries"
        emptyLabel="No grocery partners are open right now."
      />
    </PublicLayout>
  );
}
