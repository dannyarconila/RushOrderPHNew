import { createFileRoute } from "@tanstack/react-router";

import { MemberDirectory } from "@/components/admin/member-directory";
import { PageHeader } from "@/components/dashboard/primitives";

export const Route = createFileRoute("/internal-admin/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  return (
    <>
      <PageHeader
        title="Customers"
        description="Search registered customers, review profiles and moderate accounts."
      />
      <MemberDirectory
        role="customer"
        emptyTitle="No customers found"
        emptyDescription="No customer accounts match your current search and filters."
      />
    </>
  );
}
