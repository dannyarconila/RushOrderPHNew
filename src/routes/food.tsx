import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";
import { PageHero, PublicLayout } from "@/components/site/public-layout";

export const Route = createFileRoute("/food")({
  head: () => ({
    meta: [
      { title: "Food Delivery — RushOrder PH" },
      {
        name: "description",
        content:
          "Order from verified local restaurants, carinderias and home kitchens with rush delivery across the Philippines.",
      },
      { property: "og:title", content: "Food Delivery — RushOrder PH" },
      {
        property: "og:description",
        content:
          "Order from verified local restaurants, carinderias and home kitchens with rush delivery.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FoodPage,
});

function FoodPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Food"
        title="Restaurants, carinderias and home kitchens"
        description="Hot meals from verified partners near you, delivered by RushOrder riders."
      />
      <MarketplaceBrowser serviceType="food" emptyLabel="No food partners are open right now." />
    </PublicLayout>
  );
}
