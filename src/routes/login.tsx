import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/logo";
import { TextField } from "@/components/forms/wizard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardRoute } from "@/lib/dashboard-route";
import { LegalModal } from "@/components/legal/legal-modal";
import { legalDocumentQuery, legalVersionSnapshotQuery } from "@/lib/legal/public";

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN || window.location.origin;

function safeNext(value: unknown): string | undefined {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : undefined;
}

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string; oauth?: string } => {
    const next = safeNext(s.next);
    const oauth = s.oauth === "google" ? "google" : undefined;
    return { ...(next ? { next } : {}), ...(oauth ? { oauth } : {}) };
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
  const [acceptedGoogleLegal, setAcceptedGoogleLegal] = useState(false);
  const { user, primaryRole, loading } = useAuth();
  const navigate = useNavigate();
  const versions = useQuery(legalVersionSnapshotQuery());
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [selectedLegalSlug, setSelectedLegalSlug] = useState("");
  const { data: legalDocument } = useQuery({
    ...legalDocumentQuery(selectedLegalSlug),
    enabled: showLegalModal && selectedLegalSlug.length > 0,
  });
  const { next, oauth } = Route.useSearch();

  useEffect(() => {
    if (loading || !user) return;

    let cancelled = false;
    async function finishGoogleConsent() {
      if (oauth !== "google") return;
      const raw = localStorage.getItem("rushorder-google-legal-consent");
      if (!raw) return;

      try {
        const saved = JSON.parse(raw) as { termsVersion?: string; privacyVersion?: string };
        const termsVersion = saved.termsVersion || versions.data?.termsVersion || "1.0.0";
        const privacyVersion = saved.privacyVersion || versions.data?.privacyVersion || "1.0.0";
        const { error } = await supabase.rpc(
          "accept_customer_legal" as never,
          {
            _terms_version: termsVersion,
            _privacy_version: privacyVersion,
          } as never,
        );
        if (error) {
          toast.error("Could not save legal acceptance", { description: error.message });
          return;
        }
        localStorage.removeItem("rushorder-google-legal-consent");
      } catch {
        localStorage.removeItem("rushorder-google-legal-consent");
      }
    }

    void finishGoogleConsent().finally(() => {
      if (cancelled) return;
      if (next) {
        navigate({ href: next, replace: true });
        return;
      }
      navigate({ to: getDashboardRoute(primaryRole), replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [loading, user, primaryRole, navigate, next, oauth, versions.data]);

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
    if (!acceptedGoogleLegal) {
      toast.error("Please accept the Terms & Conditions and Privacy Policy first.");
      return;
    }
    const termsVersion = versions.data?.termsVersion ?? "1.0.0";
    const privacyVersion = versions.data?.privacyVersion ?? "1.0.0";
    localStorage.setItem(
      "rushorder-google-legal-consent",
      JSON.stringify({ termsVersion, privacyVersion }),
    );

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

          <label className="mt-4 flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm">
            <Checkbox
              checked={acceptedGoogleLegal}
              onCheckedChange={(nextValue) => setAcceptedGoogleLegal(Boolean(nextValue))}
            />
            <span>
              I agree to the{" "}
              <button
                type="button"
                onClick={() => {
                  setSelectedLegalSlug("terms-conditions");
                  setShowLegalModal(true);
                }}
                className="font-semibold text-primary hover:underline"
              >
                Terms & Conditions
              </button>
              and{" "}
              <button
                type="button"
                onClick={() => {
                  setSelectedLegalSlug("privacy-policy");
                  setShowLegalModal(true);
                }}
                className="font-semibold text-primary hover:underline"
              >
                Privacy Policy
              </button>
              .
            </span>
          </label>
          <Button
            variant="outline"
            size="lg"
            block
            onClick={handleGoogle}
            disabled={!acceptedGoogleLegal}
          >
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
      <LegalModal
        open={showLegalModal}
        document={legalDocument ?? null}
        onClose={() => {
          setShowLegalModal(false);
          setSelectedLegalSlug("");
        }}
      />
    </div>
  );
}
