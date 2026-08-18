import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  ActionDialog,
  AdminTable,
  DetailDialog,
  DetailGrid,
  FilterBar,
  FilterChip,
  Pill,
  SearchBox,
  Section,
  Td,
  dateTime,
  shortId,
  statusTone,
} from "@/components/admin/primitives";
import { EmptyState, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { setAccountStatus } from "@/lib/admin/mutations";
import { membersByRoleQuery, type AccountStatus, type Member } from "@/lib/admin/queries";
import type { AppRole } from "@/types";
import { Users } from "lucide-react";
import { adjustWalletBalance } from "@/lib/admin/mutations";

const STATUS_FILTERS: (AccountStatus | "all")[] = ["all", "active", "suspended", "banned"];

export function MemberDirectory({
  role,
  emptyTitle,
  emptyDescription,
  extraHead = [],
  renderExtra,
  renderDetails,
  rowActions,
}: {
  role: AppRole;
  emptyTitle: string;
  emptyDescription: string;
  extraHead?: string[];
  renderExtra?: (member: Member) => ReactNode;
  renderDetails?: (member: Member) => ReactNode;
  rowActions?: (member: Member) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const { data: members, isLoading } = useQuery(membersByRoleQuery(role));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "all">("all");
  const [pending, setPending] = useState<{ member: Member; next: AccountStatus } | null>(null);
  const [details, setDetails] = useState<Member | null>(null);
  const [walletDialog, setWalletDialog] = useState<{
    member: Member;
    mode: "credit" | "debit";
  } | null>(null);

  const [walletAmount, setWalletAmount] = useState("0");
  const walletMutation = useMutation({
    mutationFn: adjustWalletBalance,
    onSuccess: () => {
      toast.success("Wallet updated.");
      setWalletDialog(null);
      setWalletAmount("0");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const mutation = useMutation({
    mutationFn: setAccountStatus,
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: ["admin", "members", role],
        type: "active",
      });

      toast.success("Account status updated successfully.");
      setPending(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (members ?? []).filter((m) => {
      if (status !== "all" && m.account_status !== status) return false;
      if (!term) return true;
      return [m.full_name, m.phone, m.city, m.id].some((v) =>
        (v ?? "").toLowerCase().includes(term),
      );
    });
  }, [members, search, status]);

  return (
    <Panel
      title={`${rows.length} ${role}s`}
      description="Search, review and moderate member accounts."
    >
      <FilterBar>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search name, phone, city or ID"
        />
        {STATUS_FILTERS.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s}
          </FilterChip>
        ))}
      </FilterBar>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading members…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={Users} title={emptyTitle} description={emptyDescription} />
      ) : (
        <AdminTable head={["Member", "Contact", "Joined", ...extraHead, "Status", "Actions"]}>
          {rows.map((member) => (
            <tr key={member.id}>
              <Td>
                <p className="font-semibold">{member.full_name ?? "Unnamed member"}</p>
                <p className="text-xs text-muted-foreground">{shortId(member.id)}</p>
              </Td>
              <Td>
                <p className="text-sm">{member.phone ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{member.city ?? "—"}</p>
              </Td>
              <Td className="text-xs text-muted-foreground">{dateTime(member.created_at)}</Td>
              {renderExtra ? renderExtra(member) : null}
              <Td>
                <Pill tone={statusTone(member.account_status)}>{member.account_status}</Pill>
              </Td>
              <Td>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setDetails(member)}>
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWalletDialog({
                        member,
                        mode: "credit",
                      })
                    }
                  >
                    + Wallet
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setWalletDialog({
                        member,
                        mode: "debit",
                      })
                    }
                  >
                    - Wallet
                  </Button>

                  {rowActions?.(member)}

                  {member.account_status === "active" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setPending({ member, next: "suspended" })}
                    >
                      Ban Account
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => setPending({ member, next: "active" })}>
                      Reactivate
                    </Button>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </AdminTable>
      )}

      <ActionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.next === "active" ? "Reactivate this account?" : "Ban this account?"}
        description={pending?.member.full_name ?? pending?.member.id}
        confirmLabel={pending?.next === "active" ? "Reactivate" : "Ban Account"}
        destructive={pending?.next !== "active"}
        noteLabel="Reason shared with the member"
        requireNote={pending?.next !== "active"}
        pending={mutation.isPending}
        onConfirm={(note) =>
          pending &&
          mutation.mutate({
            userId: pending.member.id,
            status: pending.next === "active" ? "active" : "suspended",
            note: note || null,
          })
        }
      />

      <DetailDialog
        open={Boolean(details)}
        onOpenChange={(open) => !open && setDetails(null)}
        title={details?.full_name ?? "Member profile"}
      >
        {details ? (
          <>
            <Section title="Profile">
              <DetailGrid
                data={{
                  user_id: details.id,
                  full_name: details.full_name ?? "—",
                  phone: details.phone ?? "—",
                  city: details.city ?? "—",
                  roles: details.roles.join(", "),
                  account_status: details.account_status,
                  status_note: details.status_note ?? "—",
                  joined: dateTime(details.created_at),
                }}
              />
            </Section>
            {renderDetails?.(details)}
          </>
        ) : null}
      </DetailDialog>
      <ActionDialog
        open={Boolean(walletDialog)}
        onOpenChange={(open) => !open && setWalletDialog(null)}
        title={walletDialog?.mode === "credit" ? "Add Wallet Balance" : "Deduct Wallet Balance"}
        description={walletDialog?.member.full_name ?? undefined}
        confirmLabel={walletDialog?.mode === "credit" ? "Add Balance" : "Deduct Balance"}
        pending={walletMutation.isPending}
        noteLabel="Amount (PHP)"
        requireNote
        onConfirm={() => {
          if (!walletDialog) return;

          walletMutation.mutate({
            userId: walletDialog.member.id,
            amount: Number(walletAmount),
            walletType: walletDialog.member.roles.includes("rider") ? "rider" : "seller",
            operation: walletDialog.mode,
          });
        }}
      />
    </Panel>
  );
}
