import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PublicLayout, PageHero } from "@/components/site/public-layout";
import { legalCenterQuery } from "@/lib/legal/public";

export const Route = createFileRoute("/legal")({
  head: () => ({
    meta: [
      { title: "Legal Center — RushOrder PH" },
      {
        name: "description",
        content:
          "Legal Center for RushOrder PH including Terms, Privacy Policy, Seller and Rider Terms, and safety policies.",
      },
      { property: "og:title", content: "Legal Center — RushOrder PH" },
      {
        property: "og:description",
        content: "Read legal, privacy, trust, and compliance policies of RushOrder PH.",
      },
    ],
  }),
  component: LegalCenterPage,
});

function LegalCenterPage() {
  const { data, isLoading } = useQuery(legalCenterQuery());

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Legal & Compliance"
        title="RushOrder PH Legal Center"
        description="Read our legal terms, privacy commitments, trust safeguards, and policy standards for customers, sellers, and riders."
      />

      <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-[var(--shadow-soft)]">
          Every policy page includes version metadata, last updated date, table of contents, anchor
          navigation, and print-friendly formatting.
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading legal documents…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {(data ?? []).map((doc) => (
              <Link
                key={doc.slug}
                to="/legal/$slug"
                params={{ slug: doc.slug }}
                className="group rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)] transition-colors hover:border-primary"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  Version {doc.version}
                </p>
                <h2 className="mt-2 font-display text-xl font-bold tracking-tight group-hover:text-primary">
                  {doc.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">{doc.summary}</p>
                <p className="mt-4 text-xs font-semibold text-muted-foreground">
                  Last updated: {doc.lastUpdatedLabel}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}
