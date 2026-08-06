import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { type LegalDocumentResolved } from "@/lib/legal/catalog";

export function LegalDocumentView({ doc }: { doc: LegalDocumentResolved }) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState(doc.toc[0]?.id ?? "");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible?.target.id) {
          setActiveSection(visible.target.id);
        }
      },
      {
        rootMargin: "-20% 0px -65% 0px",
        threshold: 0.1,
      },
    );

    doc.toc.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [doc]);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
      <header className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-none print:shadow-none">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Legal Center</p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {doc.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{doc.summary}</p>
        <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <MetaPill label={`Version ${doc.version}`} />
          <MetaPill label={`Published ${doc.publishedAt}`} />
          <MetaPill label={`Last Updated ${doc.lastUpdatedLabel}`} />
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr] print:block">
        <aside className="sticky top-24 h-fit rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] print:hidden overflow-hidden">
          <div className="border-b border-border px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Table of Contents
            </p>
          </div>
          <nav className="max-h-[70vh] overflow-y-auto p-3 text-sm">
            {doc.toc.map((entry) => (
              <a
                key={entry.id}
                href={`#${entry.id}`}
                className={`block rounded-md px-3 py-2 transition-all ${
                  activeSection === entry.id
                    ? "bg-primary text-primary-foreground font-semibold"
                    : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
                }`}
              >
                {entry.title}
              </a>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => router.history.back()}
            className="mt-4 inline-flex text-sm font-semibold text-primary hover:underline"
          >
            ← Back to previous page
          </button>
        </aside>

        <article className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] print:rounded-none print:border-none print:p-0 print:shadow-none">
          <div className="mb-4 border-b border-border pb-4 text-xs text-muted-foreground print:hidden">
            Anchor navigation is available in the left panel. Use your browser print function for a
            printer-friendly copy.
          </div>

          <div className="space-y-8">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28">
                <h2 className="font-display text-xl font-bold tracking-tight">{section.title}</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {section.body.map((line, index) => (
                    <p key={`${section.id}-${index}`}>{line}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </div>
  );
}

function MetaPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-border bg-secondary px-3 py-1 font-semibold text-foreground">
      {label}
    </span>
  );
}
