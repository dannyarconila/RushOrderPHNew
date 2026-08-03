import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock3 } from "lucide-react";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/errands")({
  head: () => ({
    meta: [
      { title: "Run Errands/Pasugo — Coming Soon | RushOrder PH" },
      {
        name: "description",
        content: "RushOrder PH errands and Pasugo services are coming soon.",
      },
    ],
  }),
  component: ErrandsComingSoonPage,
});

function ErrandsComingSoonPage() {
  return (
    <PublicLayout>
      <main className="flex min-h-[65vh] items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-lg text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Clock3 className="size-7" />
          </span>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-primary">
            Run Errands/Pasugo
          </p>
          <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
            Coming Soon!
          </h1>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            We’re preparing a convenient way to request errands and Pasugo services through RushOrder PH.
          </p>
          <Button asChild className="mt-8">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
    </PublicLayout>
  );
}
