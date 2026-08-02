import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileImage, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  ActionDialog,
  AdminTable,
  FilterBar,
  FilterChip,
  Pill,
  SearchBox,
  Td,
  dateTime,
  peso,
  shortId,
  statusTone,
} from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StorageImage } from "@/components/media/storage-image";
import { BUCKETS, signedUrlQuery } from "@/lib/storage";
import { membersByRoleQuery } from "@/lib/admin/queries";
import {
  adminTopupsQuery,
  approveTopup,
  rejectTopup,
  TOPUP_STATUSES,
  type TopupRow,
  type TopupStatus,
} from "@/lib/wallet";

export const Route = createFileRoute("/internal-admin/topups")({
  component: TopupsPage,
});

const FILTERS: (TopupStatus | "all")[] = [
  "pending",
  ...TOPUP_STATUSES.filter((s) => s !== "pending"),
  "all",
];

function TopupsPage() {
  const [status, setStatus] = useState<TopupStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const { data: topups, isLoading } = useQuery(adminTopupsQuery(status));
  const { data: pending } = useQuery(adminTopupsQuery("pending"));

  const { data: sellers } = useQuery(membersByRoleQuery("seller"));
  const { data: riders } = useQuery(membersByRoleQuery("rider"));
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of [...(sellers ?? []), ...(riders ?? [])]) map.set(m.id, m.full_name ?? "");
    return map;
  }, [sellers, riders]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return topups ?? [];
    return (topups ?? []).filter(
      (t) =>
        t.reference_number.toLowerCase().includes(term) ||
        t.user_id.toLowerCase().includes(term) ||
        (nameOf.get(t.user_id) ?? "").toLowerCase().includes(term),
    );
  }, [topups, search, nameOf]);

  const pendingTotal = (pending ?? []).reduce((sum, t) => sum + Number(t.amount ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Wallet management"
        description="Review manual top-up requests, verify payment proof and credit seller or rider wallets."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending requests" value={String((pending ?? []).length)} icon={Wallet} />
        <StatCard label="Pending value" value={peso(pendingTotal)} icon={Wallet} />
        <StatCard
          label="Showing"
          value={String(rows.length)}
          icon={CheckCircle2}
          hint={`Filter: ${status}`}
        />
      </div>

      <Panel title="Top-up requests" className="mt-6">
        <FilterBar>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Search by reference, user or name"
          />
          {FILTERS.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s}
            </FilterChip>
          ))}
        </FilterBar>

        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading top-up requests…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No top-up requests"
            description="Requests submitted by sellers and riders will appear here for review."
          />
        ) : (
          <AdminTable
            head={[
              "Submitted",
              "User",
              "Role",
              "Method",
              "Reference",
              "Amount",
              "Status",
              "Actions",
            ]}
          >
            {rows.map((topup) => (
              <TopupRowView key={topup.id} topup={topup} name={nameOf.get(topup.user_id)} />
            ))}
          </AdminTable>
        )}
      </Panel>
    </>
  );
}

function TopupRowView({ topup, name }: { topup: TopupRow; name?: string }) {
  const queryClient = useQueryClient();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [proofOpen, setProofOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "topups"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "wallets"] });
    void queryClient.invalidateQueries({ queryKey: ["admin", "wallet-ledger"] });
  };

  const approve = useMutation({
    mutationFn: (notes: string) => approveTopup({ id: topup.id, notes: notes || null }),
    onSuccess: () => {
      toast.success("Top-up approved — wallet credited");
      setAction(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => rejectTopup({ id: topup.id, reason }),
    onSuccess: () => {
      toast.success("Top-up rejected");
      setAction(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <tr>
      <Td className="text-xs text-muted-foreground">{dateTime(topup.created_at)}</Td>
      <Td className="text-sm">{name || shortId(topup.user_id)}</Td>
      <Td className="text-xs uppercase">{topup.wallet_type}</Td>
      <Td className="text-sm">{topup.payment_method_name}</Td>
      <Td className="font-mono text-xs">{topup.reference_number}</Td>
      <Td className="text-sm font-semibold">{peso(topup.amount)}</Td>
      <Td>
        <Pill tone={statusTone(topup.status)}>{topup.status}</Pill>
        {topup.review_notes ? (
          <p className="mt-1 max-w-[14rem] text-[11px] text-muted-foreground">
            {topup.review_notes}
          </p>
        ) : null}
      </Td>
      <Td>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setProofOpen(true)}
            disabled={!topup.proof_path}
          >
            <FileImage className="size-3.5" /> View proof
          </Button>
          {topup.status === "pending" ? (
            <>
              <Button size="sm" onClick={() => setAction("approve")}>
                Approve
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setAction("reject")}>
                Reject
              </Button>
            </>
          ) : null}
        </div>

        <ActionDialog
          open={action === "approve"}
          onOpenChange={(open) => setAction(open ? "approve" : null)}
          title={`Approve ${peso(topup.amount)} top-up?`}
          description="This immediately credits the user's wallet, records a ledger entry and notifies them."
          confirmLabel="Approve and credit"
          noteLabel="Internal note (optional)"
          pending={approve.isPending}
          onConfirm={(note) => approve.mutate(note)}
        />
        <ActionDialog
          open={action === "reject"}
          onOpenChange={(open) => setAction(open ? "reject" : null)}
          title="Reject this top-up request?"
          description="The user is notified with the reason you provide."
          confirmLabel="Reject request"
          destructive
          noteLabel="Rejection reason"
          requireNote
          pending={reject.isPending}
          onConfirm={(note) => reject.mutate(note)}
        />
        <ProofDialog open={proofOpen} onOpenChange={setProofOpen} path={topup.proof_path} />
      </Td>
    </tr>
  );
}

function ProofDialog({
  open,
  onOpenChange,
  path,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string | null;
}) {
  const { data: url } = useQuery({
    ...signedUrlQuery(BUCKETS.paymentProofs, path, true),
    enabled: open && Boolean(path),
  });
  const isPdf = (path ?? "").toLowerCase().endsWith(".pdf");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Proof of payment</DialogTitle>
        </DialogHeader>
        {!path ? (
          <p className="text-sm text-muted-foreground">No proof was uploaded with this request.</p>
        ) : isPdf ? (
          <a
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
          >
            <FileImage className="size-4" /> Open PDF receipt
          </a>
        ) : (
          <StorageImage
            bucket={BUCKETS.paymentProofs}
            path={path}
            admin
            alt="Payment receipt"
            className="w-full rounded-xl border border-border object-contain"
            fallback={<p className="text-sm text-muted-foreground">Loading receipt…</p>}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
