import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";
import { PageHero, PublicLayout } from "@/components/site/public-layout";

export const Route = createFileRoute("/pharmacy")({
  head: () => ({
    meta: [
      { title: "Pharmacy Delivery — RushOrder PH" },
      {
        name: "description",
        content:
          "Order medicines and health essentials from licensed partner pharmacies with fast, discreet delivery.",
      },
      { property: "og:title", content: "Pharmacy Delivery — RushOrder PH" },
      {
        property: "og:description",
        content: "Medicines and health essentials from licensed partner pharmacies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PharmacyPage,
});

function PharmacyPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Pharmacy"
        title="Licensed pharmacies, delivered discreetly"
        description="Medicines and health essentials from verified pharmacy partners."
      />
      <MarketplaceBrowser
        serviceType="pharmacy"
        emptyLabel="No pharmacy partners are open right now."
      />
    </PublicLayout>
  );
}
