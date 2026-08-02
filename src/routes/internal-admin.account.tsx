import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import { adminChangeCredentialsFn, adminResetCredentialsFn } from "@/lib/admin/auth.functions";
import { ADMIN_ROLE_LABELS, MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/admin/contracts";

export const Route = createFileRoute("/internal-admin/account")({
  component: AdminAccountPage,
});

function AdminAccountPage() {
  const { session, refresh, signOut } = useAdminAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [username, setUsername] = useState(session?.username ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [confirmWord, setConfirmWord] = useState("");

  const change = useMutation({
    mutationFn: () =>
      adminChangeCredentialsFn({
        data: { currentPassword, username, password: password || undefined, confirmPassword },
      }),
    onSuccess: async () => {
      toast.success("Credentials updated.");
      setCurrentPassword("");
      setPassword("");
      setConfirmPassword("");
      await refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reset = useMutation({
    mutationFn: () =>
      adminResetCredentialsFn({ data: { currentPassword: resetPassword, confirm: confirmWord } }),
    onSuccess: async () => {
      toast.success("Account restored to default credentials. Sign in again to set them up.");
      await signOut("Credentials were reset. Sign in with the default credentials.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="My account"
        description={
          session
            ? `Signed in as ${session.username} · ${ADMIN_ROLE_LABELS[session.role]}. Sessions expire after ${session.sessionTimeoutMinutes} minutes of inactivity.`
            : "Manage your internal portal credentials."
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Change credentials" description="Your current password is required.">
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              change.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-username">Username</Label>
              <Input
                id="account-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-password">New password (optional)</Label>
              <Input
                id="account-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                At least {MIN_ADMIN_PASSWORD_LENGTH} characters, letters and numbers.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-confirm">Confirm new password</Label>
              <Input
                id="account-confirm"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={change.isPending || !currentPassword}>
              {change.isPending ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Panel>

        <Panel
          title="Restore default credentials"
          description="Reverts this account to the factory username and password and forces security setup on the next sign-in."
        >
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              reset.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="reset-current">Current password</Label>
              <Input
                id="reset-current"
                type="password"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
              <Input
                id="reset-confirm"
                value={confirmWord}
                onChange={(event) => setConfirmWord(event.target.value)}
                placeholder="RESET"
              />
            </div>
            <Button type="submit" variant="outline" disabled={reset.isPending || !resetPassword}>
              {reset.isPending ? "Resetting…" : "Restore defaults"}
            </Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
