import { createFileRoute } from "@tanstack/react-router";

import { ApplicationReview } from "@/components/admin/application-review";
import { PageHeader } from "@/components/dashboard/primitives";

export const Route = createFileRoute("/internal-admin/rider-applications")({
  component: RiderApplicationsPage,
});

function RiderApplicationsPage() {
  return (
    <>
      <PageHeader
        title="Rider applications"
        description="Review rider onboarding, licence and vehicle documents before activating dashboards."
      />
      <ApplicationReview kind="rider" />
    </>
  );
}
