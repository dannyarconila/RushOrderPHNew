import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/logo";
import { TextField } from "@/components/forms/wizard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardRoute } from "@/lib/dashboard-route";

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN || window.location.origin;

function safeNext(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => {
    const next = safeNext(s.next);
    return next ? { next } : {};
  },
  head: () => ({
    meta: [
      { title: "Log in — RushOrder PH" },
      {
        name: "description",
        content: "Sign in to your RushOrder PH customer, selling partner, rider or admin account.",
      },
      { property: "og:title", content: "Log in to RushOrder PH" },
      { property: "og:description", content: "Access your RushOrder PH dashboard." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const { user, primaryRole, loading } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  useEffect(() => {
    if (loading || !user) return;
    // Return the visitor to where they came from (e.g. a protected page or an OAuth consent screen).
    if (next) {
      navigate({ href: next, replace: true });
      return;
    }
    navigate({ to: getDashboardRoute(primaryRole), replace: true });
  }, [loading, user, primaryRole, navigate, next]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Could not sign in", { description: error.message });
      return;
    }
    toast.success("Welcome back");
  }

  async function handleGoogle() {
    const callback = new URL("/login", APP_ORIGIN);
    if (next) callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callback.toString(),
      },
    });
    if (error) {
      toast.error("Google sign-in failed", { description: error.message });
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-sm">
          <Logo />
          <h1 className="mt-8 text-3xl font-extrabold tracking-tight">Welcome back</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to manage your orders, storefront or deliveries.
          </p>

          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@email.com"
              required
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
            />
            <Button type="submit" size="lg" block disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Log in
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" block onClick={handleGoogle}>
            Continue with Google
          </Button>

          <p className="mt-8 text-sm text-muted-foreground">
            New to RushOrder PH?{" "}
            <Link to="/register" className="font-semibold text-primary hover:underline">
              Create an account
            </Link>
          </p>

          <div className="mt-6 grid gap-2 border-t border-border pt-6 sm:grid-cols-2">
            <Button asChild variant="ghost" size="sm" block>
              <Link to="/">Back to home</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" block>
              <Link to="/marketplace">Browse marketplace</Link>
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Sign in is required across the RushOrder PH marketplace.
          </p>
        </div>
      </div>

      <aside className="surface-hero hidden flex-col justify-end p-12 text-ink-foreground lg:flex">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-accent">RushOrder PH</p>
        <h2 className="mt-4 max-w-md text-4xl font-extrabold leading-tight">
          One account. Shop, sell and deliver.
        </h2>
        <p className="mt-4 max-w-md text-sm text-ink-foreground/70">
          Upgrade any customer account into a selling partner or rider profile whenever you're
          ready.
        </p>
      </aside>
    </div>
  );
}
