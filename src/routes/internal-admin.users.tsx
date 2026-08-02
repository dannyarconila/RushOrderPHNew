import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminTable, Pill, Td } from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminAuth } from "@/contexts/admin-auth-context";
import {
  adminCreateUserFn,
  adminDeleteUserFn,
  adminListUsersFn,
  adminUpdateUserFn,
} from "@/lib/admin/auth.functions";
import {
  ADMIN_ROLES,
  ADMIN_ROLE_LABELS,
  type AdminAccountSummary,
  type AdminRole,
} from "@/lib/admin/contracts";

export const Route = createFileRoute("/internal-admin/users")({
  component: AdminUsersPage,
});

const dt = (value: string | null) => (value ? new Date(value).toLocaleString("en-PH") : "—");

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { session } = useAdminAuth();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "admin-users"],
    queryFn: () => adminListUsersFn(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "admin-users"] });

  const update = useMutation({
    mutationFn: (input: { id: string; role?: AdminRole; isActive?: boolean; password?: string }) =>
      adminUpdateUserFn({ data: input }),
    onSuccess: () => {
      toast.success("Administrator updated.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => adminDeleteUserFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Administrator removed.");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Admin users"
        description="Internal portal accounts. These are isolated from customer, seller and rider sign-ins."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> New administrator
          </Button>
        }
      />

      <Panel title="Administrators">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading administrators…</p>
        ) : (users ?? []).length === 0 ? (
          <EmptyState
            icon={UserCog}
            title="No administrators"
            description="Create the first internal account."
          />
        ) : (
          <AdminTable head={["Username", "Role", "Status", "Last sign-in", "Actions"]}>
            {(users ?? []).map((account) => (
              <AdminRow
                key={account.id}
                account={account}
                isSelf={account.id === session?.id}
                onUpdate={(input) => update.mutate({ id: account.id, ...input })}
                onRemove={() => remove.mutate(account.id)}
                pending={update.isPending || remove.isPending}
              />
            ))}
          </AdminTable>
        )}
      </Panel>

      <CreateAdminDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setCreateOpen(false);
          void invalidate();
        }}
      />
    </>
  );
}

function AdminRow({
  account,
  isSelf,
  onUpdate,
  onRemove,
  pending,
}: {
  account: AdminAccountSummary;
  isSelf: boolean;
  onUpdate: (input: { role?: AdminRole; isActive?: boolean; password?: string }) => void;
  onRemove: () => void;
  pending: boolean;
}) {
  const [resetOpen, setResetOpen] = useState(false);
  const locked = account.locked_until && new Date(account.locked_until) > new Date();

  return (
    <tr className="border-t border-border">
      <Td>
        <p className="text-sm font-semibold">
          {account.username}
          {isSelf ? <span className="ml-2 text-xs text-muted-foreground">(you)</span> : null}
        </p>
        <p className="text-xs text-muted-foreground">Created {dt(account.created_at)}</p>
      </Td>
      <Td>
        <select
          value={account.role}
          disabled={pending}
          onChange={(event) => onUpdate({ role: event.target.value as AdminRole })}
          className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm font-semibold"
        >
          {ADMIN_ROLES.map((role) => (
            <option key={role} value={role}>
              {ADMIN_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={account.is_active ? "success" : "neutral"}>
            {account.is_active ? "active" : "disabled"}
          </Pill>
          {locked ? <Pill tone="danger">locked</Pill> : null}
          {account.must_change_credentials ? <Pill tone="warning">setup pending</Pill> : null}
        </div>
      </Td>
      <Td>
        <p className="text-sm">{dt(account.last_login_at)}</p>
        <p className="text-xs text-muted-foreground">{account.last_login_ip ?? "—"}</p>
      </Td>
      <Td>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setResetOpen(true)}>
            Reset password
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || isSelf}
            onClick={() => onUpdate({ isActive: !account.is_active })}
          >
            {account.is_active ? "Disable" : "Enable"}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending || isSelf} onClick={onRemove}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
        <ResetPasswordDialog
          open={resetOpen}
          onOpenChange={setResetOpen}
          username={account.username}
          onSubmit={(password) => {
            onUpdate({ password });
            setResetOpen(false);
          }}
        />
      </Td>
    </tr>
  );
}

function ResetPasswordDialog({
  open,
  onOpenChange,
  username,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  onSubmit: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password for {username}</DialogTitle>
          <DialogDescription>
            The administrator will be asked to choose new credentials on their next sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reset-password">Temporary password</Label>
          <Input
            id="reset-password"
            type="text"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters with letters and numbers"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!password} onClick={() => onSubmit(password)}>
            Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateAdminDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>("support");

  const mutation = useMutation({
    mutationFn: () => adminCreateUserFn({ data: { username, password, role } }),
    onSuccess: () => {
      toast.success("Administrator created.");
      setUsername("");
      setPassword("");
      setRole("support");
      onCreated();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New administrator</DialogTitle>
          <DialogDescription>
            They must replace this temporary password the first time they sign in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-admin-username">Username</Label>
            <Input
              id="new-admin-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-admin-password">Temporary password</Label>
            <Input
              id="new-admin-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-admin-role">Role</Label>
            <select
              id="new-admin-role"
              value={role}
              onChange={(event) => setRole(event.target.value as AdminRole)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold"
            >
              {ADMIN_ROLES.map((value) => (
                <option key={value} value={value}>
                  {ADMIN_ROLE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Create administrator
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
