import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Bike, Clock3, Loader2, PackageCheck } from "lucide-react";
import { useState } from "react";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/errands")({
  head: () => ({
    meta: [
      { title: "Run Errands/Pasugo — RushOrder PH" },
      {
        name: "description",
        content:
          "Book Pasugo and Pabili help fast through RushOrder PH and connect with available riders.",
      },
    ],
  }),
  component: ErrandsPage,
});

function ErrandsPage() {
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <section className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-soft)] sm:p-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <Bike className="size-3.5" /> Pasugo / Pabili
          </span>
          <h1 className="mt-5 max-w-3xl font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
            Send a rider for your quick errands
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Need groceries, pharmacy items, store pickup, or document drop-off? Use RushOrder PH
            rider booking and get updates while your task is in progress.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg" onClick={() => setComingSoonOpen(true)}>
              <>
                Book a rider now <ArrowRight className="size-4" />
              </>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/marketplace">Browse stores first</Link>
            </Button>
          </div>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <Clock3 className="size-5" />
            </span>
            <h2 className="mt-4 text-base font-bold">Fast pickup windows</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Riders are matched based on availability in your area.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-success/15 text-success">
              <PackageCheck className="size-5" />
            </span>
            <h2 className="mt-4 text-base font-bold">Task status tracking</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Stay updated from acceptance to completion in one flow.
            </p>
          </article>
          <article className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent/20 text-accent-foreground">
              <Bike className="size-5" />
            </span>
            <h2 className="mt-4 text-base font-bold">Rider booking lane</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tap Book a rider now to open the errands and services booking lane.
            </p>
          </article>
        </section>

        <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-2xl">🚴 Pasugo Coming Soon</DialogTitle>
              <DialogDescription className="pt-2 text-sm leading-relaxed">
                Our standalone Pasugo (Errands) service is currently under development.
                <br />
                <br />
                We are working on real-time rider matching, live tracking, and in-app chat to
                provide the best experience.
                <br />
                <br />
                This feature will be available in a future update.
                <br />
                <br />
                Thank you for supporting RushOrder PH.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3 sm:gap-2">
              <Button onClick={() => setComingSoonOpen(false)}>OK</Button>
              <Button variant="outline" onClick={() => setComingSoonOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </PublicLayout>
  );
}
