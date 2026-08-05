import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { PublicLayout } from "@/components/site/public-layout";
import { legalDocumentQuery } from "@/lib/legal/public";

export const Route = createFileRoute("/legal/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ")} — RushOrder PH Legal` },
      {
        name: "description",
        content: "Legal policy details from RushOrder PH Legal Center.",
      },
    ],
  }),
  component: LegalDocumentPage,
});

function LegalDocumentPage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery(legalDocumentQuery(slug));

  return (
    <PublicLayout>
      {isLoading ? (
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm text-muted-foreground">Loading document…</p>
        </div>
      ) : data ? (
        <LegalDocumentView doc={data} />
      ) : (
        <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            Document not found
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The requested legal document does not exist or is not currently published.
          </p>
          <Link
            to="/legal"
            className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
          >
            Back to Legal Center
          </Link>
        </div>
      )}
    </PublicLayout>
  );
}
