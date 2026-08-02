import { createFileRoute } from "@tanstack/react-router";

import { MarketplaceBrowser } from "@/components/marketplace/marketplace-browser";
import { PageHero, PublicLayout } from "@/components/site/public-layout";

export const Route = createFileRoute("/services")({
  head: () => ({
    meta: [
      { title: "Errands & Services — RushOrder PH" },
      {
        name: "description",
        content:
          "Book pabili, padala and errand services from verified RushOrder partners and riders.",
      },
      { property: "og:title", content: "Errands & Services — RushOrder PH" },
      {
        property: "og:description",
        content: "Pabili, padala and errand services from verified partners and riders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

function ServicesPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Services"
        title="Pabili, padala and everyday errands"
        description="Send a rider for the small tasks that eat up your day."
      />
      <MarketplaceBrowser
        serviceType="services"
        emptyLabel="No service partners are available right now."
      />
    </PublicLayout>
  );
}
