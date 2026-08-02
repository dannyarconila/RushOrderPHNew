import { createFileRoute } from "@tanstack/react-router";

import { ApplicationReview } from "@/components/admin/application-review";
import { PageHeader } from "@/components/dashboard/primitives";

export const Route = createFileRoute("/internal-admin/store-applications")({
  component: StoreApplicationsPage,
});

function StoreApplicationsPage() {
  return (
    <>
      <PageHeader
        title="Store applications"
        description="Review selling partner applications, their documents and approve storefronts."
      />
      <ApplicationReview kind="seller" />
    </>
  );
}
