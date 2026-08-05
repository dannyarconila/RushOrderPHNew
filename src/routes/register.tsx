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
import { legalVersionSnapshotQuery } from "@/lib/legal/public";

const APP_ORIGIN = import.meta.env.VITE_APP_ORIGIN || window.location.origin;

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create your RushOrder PH account" },
      {
        name: "description",
        content:
          "Sign up free to shop local stores on RushOrder PH, then upgrade to a selling partner or rider any time.",
      },
      { property: "og:title", content: "Join RushOrder PH" },
      {
        property: "og:description",
        content: "Create a free account and start ordering in minutes.",
      },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [busy, setBusy] = useState(false);
  const { user, primaryRole, loading } = useAuth();
  const versions = useQuery(legalVersionSnapshotQuery());
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: getDashboardRoute(primaryRole), replace: true });
  }, [loading, user, primaryRole, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!acceptedLegal) {
      toast.error("Please accept the Terms & Conditions and Privacy Policy to continue.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    const termsVersion = versions.data?.termsVersion ?? "1.0.0";
    const privacyVersion = versions.data?.privacyVersion ?? "1.0.0";
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: APP_ORIGIN,
        data: {
          full_name: fullName,
          phone,
          accepted_terms: true,
          terms_version: termsVersion,
          privacy_version: privacyVersion,
        },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Could not create account", { description: error.message });
      return;
    }
    toast.success("Account created", { description: "You're all set to start ordering." });
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: APP_ORIGIN,
      },
    });
    if (error) toast.error("Google sign-up failed", { description: error.message });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="surface-hero hidden flex-col justify-end p-12 text-ink-foreground lg:flex">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-accent">
          Join RushOrder PH
        </p>
        <h2 className="mt-4 max-w-md text-4xl font-extrabold leading-tight">
          Shop local today, sell or deliver tomorrow.
        </h2>
        <p className="mt-4 max-w-md text-sm text-ink-foreground/70">
          Every account starts as a customer. Apply as a selling partner or rider from your
          dashboard.
        </p>
      </aside>

      <div className="flex items-center justify-center px-4 py-14">
        <div className="w-full max-w-sm">
          <Logo />
          <h1 className="mt-8 text-3xl font-extrabold tracking-tight">Create your account</h1>
          <p className="mt-2 text-sm text-muted-foreground">Free to join. No subscription fees.</p>

          <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
            <TextField
              label="Full name"
              value={fullName}
              onChange={setFullName}
              placeholder="Juan dela Cruz"
              required
            />
            <TextField
              label="Mobile number"
              value={phone}
              onChange={setPhone}
              placeholder="09XX XXX XXXX"
            />
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
              placeholder="At least 6 characters"
              required
            />
            <label className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-3 text-sm">
              <Checkbox
                checked={acceptedLegal}
                onCheckedChange={(next) => setAcceptedLegal(Boolean(next))}
              />
              <span>
                I agree to the{" "}
                <Link
                  to="/legal/$slug"
                  params={{ slug: "terms-conditions" }}
                  className="font-semibold text-primary hover:underline"
                >
                  Terms & Conditions
                </Link>{" "}
                and{" "}
                <Link
                  to="/legal/$slug"
                  params={{ slug: "privacy-policy" }}
                  className="font-semibold text-primary hover:underline"
                >
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
            <Button type="submit" size="lg" block disabled={busy || !acceptedLegal}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Create account
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>

          <Button variant="outline" size="lg" block onClick={handleGoogle}>
            Continue with Google
          </Button>

          <p className="mt-8 text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
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
        </div>
      </div>
    </div>
  );
}
