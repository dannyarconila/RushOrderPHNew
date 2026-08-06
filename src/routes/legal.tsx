import { Outlet, createFileRoute } from "@tanstack/react-router";

import { PublicLayout } from "@/components/site/public-layout";

export const Route = createFileRoute("/legal")({
  component: LegalLayout,
});

function LegalLayout() {
  return (
    <PublicLayout>
      <Outlet />
    </PublicLayout>
  );
}
