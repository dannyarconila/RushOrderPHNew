/**
 * Sign-in and mandatory first-run security setup for the Internal Admin Portal.
 * Uses the isolated admin account system — never Supabase Auth.
 */
import { useMutation } from "@tanstack/react-query";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { adminCompleteSetupFn } from "@/lib/admin/auth.functions";
import { DEFAULT_ADMIN_USERNAME, MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/admin/contracts";

function Shell({
  icon,
  eyebrow,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-8" />
          <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </p>
            <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-7">{children}</div>
      </div>
    </main>
  );
}

export function AdminLogin() {
  const { signIn, signOutReason, clearSignOutReason } = useAdminAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    clearSignOutReason();
    try {
      await signIn(username, password);
    } catch (cause) {
      setError((cause as Error).message || "Unable to sign in.");
      setPassword("");
    } finally {
      setPending(false);
    }
  }

  return (
    <Shell
      icon={<Lock className="size-5" />}
      eyebrow="Internal portal"
      title="Administrator sign in"
      description="This console uses its own credentials, separate from customer, seller and rider accounts."
    >
      <form className="space-y-4" onSubmit={submit}>
        {signOutReason ? (
          <p className="rounded-xl border border-border bg-secondary/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
            {signOutReason}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="admin-username">Username</Label>
          <Input
            id="admin-username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Admin"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-password">Password</Label>
          <Input
            id="admin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Repeated failed attempts temporarily lock the account.
        </p>
      </form>
    </Shell>
  );
}

/** Forced on the first sign-in: the seeded credentials must be replaced. */
export function AdminSecuritySetup() {
  const { refresh, signOut } = useAdminAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => adminCompleteSetupFn({ data: { username, password, confirmPassword } }),
    onSuccess: async () => {
      toast.success("Administrator credentials updated.");
      await refresh();
    },
    onError: (cause: Error) => setError(cause.message),
  });

  return (
    <Shell
      icon={<ShieldCheck className="size-5" />}
      eyebrow="Required setup"
      title="Secure this administrator account"
      description={`The default "${DEFAULT_ADMIN_USERNAME}" credentials cannot be used to operate the platform. Choose a permanent username and password to continue.`}
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="setup-username">New username</Label>
          <Input
            id="setup-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="rushorder.ops"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-password">New password</Label>
          <Input
            id="setup-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">
            At least {MIN_ADMIN_PASSWORD_LENGTH} characters, containing letters and numbers.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-confirm">Confirm password</Label>
          <Input
            id="setup-confirm"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
        </div>
        {error ? <p className="text-sm font-semibold text-destructive">{error}</p> : null}
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save and continue"}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </Shell>
  );
}
