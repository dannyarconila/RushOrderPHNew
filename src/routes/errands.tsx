import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Bike, Clock3, Loader2, PackageCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";

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
  const navigate = useNavigate();
  const { user } = useAuth();
  const [bookingNow, setBookingNow] = useState(false);

  const handleBookRiderNow = async () => {
    if (!user) {
      navigate({ to: "/login", search: { next: "/errands" }, replace: true });
      return;
    }

    setBookingNow(true);
    try {
      // If there's an active dispatch, continue tracking that order.
      const { data: activeDispatch } = await supabase
        .from("dispatch_jobs")
        .select("order_id,status,orders!inner(customer_id)")
        .eq("orders.customer_id", user.id)
        .in("status", ["searching", "assigned", "picked_up"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const activeOrderId = (activeDispatch as { order_id?: string } | null)?.order_id;
      if (activeOrderId) {
        navigate({ to: "/order/$orderId", params: { orderId: activeOrderId } });
        return;
      }

      // Otherwise start dispatch for the latest ready order (same flow as seller Ready for pickup).
      const { data: readyOrder } = await supabase
        .from("orders")
        .select("id")
        .eq("customer_id", user.id)
        .eq("status", "ready")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const readyOrderId = (readyOrder as { id?: string } | null)?.id;
      if (!readyOrderId) {
        toast.message("No ready order yet. Place an order in Marketplace first.");
        navigate({ to: "/marketplace" });
        return;
      }

      const { error } = await supabase.rpc("dispatch_start", { _order_id: readyOrderId });
      if (error) throw error;

      toast.success("Booking started. Finding a rider now.");
      navigate({ to: "/order/$orderId", params: { orderId: readyOrderId } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not start rider booking.";
      toast.error("Booking failed", { description: message });
      navigate({ to: "/marketplace" });
    } finally {
      setBookingNow(false);
    }
  };

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
            <Button size="lg" onClick={() => void handleBookRiderNow()} disabled={bookingNow}>
              {bookingNow ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Finding rider...
                </>
              ) : (
                <>
                  Book a rider now <ArrowRight className="size-4" />
                </>
              )}
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
      </main>
    </PublicLayout>
  );
}
