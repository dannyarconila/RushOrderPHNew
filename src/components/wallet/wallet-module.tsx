/**
 * Shared wallet module for the Seller and Rider dashboards.
 *
 * Purely presentational on top of `@/lib/wallet` — the same component powers
 * both roles by switching the `walletType`, and it will keep working unchanged
 * once automatic payment gateways create the top-up rows instead of a human.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Clock,
  Copy,
  Download,
  EyeOff,
  Loader2,
  QrCode,
  ReceiptText,
  Wallet as WalletIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { peso, dateTime, Pill, statusTone, AdminTable, Td } from "@/components/admin/primitives";
import { EmptyState, Panel, StatCard } from "@/components/dashboard/primitives";
import { StorageImage } from "@/components/media/storage-image";
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
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BUCKETS } from "@/lib/storage";
import {
  activePaymentMethodsQuery,
  cancelTopup,
  hideWalletTransaction,
  MIN_TOPUP,
  myTopupsQuery,
  myWalletQuery,
  myWalletTransactionsQuery,
  submitTopup,
  type PaymentMethodRow,
  type WalletType,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";

const WITHDRAWAL_KINDS = ["withdrawal", "payout", "withdraw"];

export function WalletModule({ walletType }: { walletType: WalletType }) {
  const { user } = useAuth();
  const [topupOpen, setTopupOpen] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [txKind, setTxKind] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: wallet, isLoading: walletLoading } = useQuery(myWalletQuery(user?.id, walletType));
  const { data: transactions, isLoading: txLoading } = useQuery(
    myWalletTransactionsQuery(wallet?.id, user?.id, 200),
  );
  const { data: topups, isLoading: topupsLoading } = useQuery(myTopupsQuery(user?.id, walletType));

  const pendingTopups = useMemo(
    () => (topups ?? []).filter((t) => t.status === "pending"),
    [topups],
  );
  const pendingTotal = pendingTopups.reduce((sum, t) => sum + Number(t.amount ?? 0), 0);
  const withdrawals = useMemo(
    () => (transactions ?? []).filter((t) => WITHDRAWAL_KINDS.includes(t.kind)),
    [transactions],
  );

  const filteredTransactions = useMemo(() => {
    const term = txSearch.trim().toLowerCase();
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    return (transactions ?? []).filter((tx) => {
      if (txKind !== "all" && tx.kind !== txKind) return false;
      const created = new Date(tx.created_at);
      if (from && created < from) return false;
      if (to && created > to) return false;
      if (!term) return true;
      return (
        tx.kind.toLowerCase().includes(term) ||
        (tx.description ?? "").toLowerCase().includes(term) ||
        (tx.reference ?? "").toLowerCase().includes(term) ||
        tx.id.toLowerCase().includes(term)
      );
    });
  }, [transactions, txKind, txSearch, fromDate, toDate]);

  function exportTransactionsCsv() {
    const head = ["when", "type", "description", "reference", "amount", "balance_after", "status"];
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filteredTransactions.map((tx) =>
      [
        tx.created_at,
        tx.kind,
        tx.description ?? "",
        tx.reference ?? "",
        Number(tx.amount ?? 0).toFixed(2),
        Number(tx.new_balance ?? 0).toFixed(2),
        tx.status,
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${walletType}-wallet-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Wallet balance"
          value={walletLoading ? "…" : peso(wallet?.balance ?? 0)}
          icon={WalletIcon}
          hint={wallet ? undefined : "Wallet opens after approval"}
        />
        <StatCard
          label="Available balance"
          value={
            walletLoading
              ? "…"
              : peso(Number(wallet?.balance ?? 0) - Number(wallet?.pending_balance ?? 0))
          }
          icon={ArrowUpRight}
          hint="Balance less held funds"
        />
        <StatCard
          label="On hold"
          value={peso(wallet?.pending_balance ?? 0)}
          icon={Clock}
          hint="Reserved for orders"
        />
        <StatCard
          label="Pending top-ups"
          value={peso(pendingTotal)}
          icon={ReceiptText}
          hint={`${pendingTopups.length} awaiting approval`}
        />
      </div>

      <Panel
        title="Top up your wallet"
        description="Pay through an approved channel, upload your receipt and we credit your wallet after verification."
        className="mt-6"
        action={
          <Button onClick={() => setTopupOpen(true)}>
            <ArrowDownToLine className="size-4" /> Top-up wallet
          </Button>
        }
      >
        {topupsLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading top-up requests…</p>
        ) : (topups ?? []).length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No top-up requests yet"
            description="Your top-up history will appear here once you submit your first request."
            action={<Button onClick={() => setTopupOpen(true)}>Top-up wallet</Button>}
          />
        ) : (
          <AdminTable head={["Submitted", "Method", "Reference", "Amount", "Status", ""]}>
            {(topups ?? []).map((topup) => (
              <tr key={topup.id}>
                <Td className="text-xs text-muted-foreground">{dateTime(topup.created_at)}</Td>
                <Td className="text-sm">{topup.payment_method_name}</Td>
                <Td className="font-mono text-xs">{topup.reference_number}</Td>
                <Td className="text-sm font-semibold">{peso(topup.amount)}</Td>
                <Td>
                  <Pill tone={statusTone(topup.status)}>{topup.status}</Pill>
                  {topup.review_notes ? (
                    <p className="mt-1 max-w-xs text-[11px] text-muted-foreground">
                      {topup.review_notes}
                    </p>
                  ) : null}
                </Td>
                <Td>{topup.status === "pending" ? <CancelTopupButton id={topup.id} /> : null}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>

      <Panel
        title="Transaction history"
        description="Every movement in this wallet, with filters and export."
        className="mt-6"
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Input
            value={txSearch}
            onChange={(e) => setTxSearch(e.target.value)}
            placeholder="Search description, ref or ID"
            className="xl:col-span-2"
          />
          <select
            value={txKind}
            onChange={(e) => setTxKind(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All types</option>
            {[...new Set((transactions ?? []).map((tx) => tx.kind))].map((kind) => (
              <option key={kind} value={kind}>
                {kind.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </div>
        {txLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Loading transactions…</p>
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            icon={WalletIcon}
            title="No transactions yet"
            description="Top-ups, earnings and deductions will show up here."
          />
        ) : (
          <>
            <div className="mb-2 flex justify-end">
              <Button size="sm" variant="outline" onClick={exportTransactionsCsv}>
                <Download className="size-4" /> Export CSV
              </Button>
            </div>
            <AdminTable
              head={["When", "Type", "Description", "Amount", "Balance after", "Status", ""]}
            >
              {filteredTransactions.map((tx) => (
              <tr key={tx.id}>
                <Td className="text-xs text-muted-foreground">{dateTime(tx.created_at)}</Td>
                <Td className="text-xs capitalize">{tx.kind.replace(/_/g, " ")}</Td>
                <Td className="text-xs text-muted-foreground">
                  {tx.description ?? tx.reference ?? "—"}
                </Td>
                <Td
                  className={cn(
                    "text-sm font-semibold",
                    Number(tx.amount) < 0 && "text-destructive",
                  )}
                >
                  {peso(tx.amount)}
                </Td>
                <Td className="text-sm">{peso(tx.new_balance)}</Td>
                <Td>
                  <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
                </Td>
                <Td>
                  {user?.id ? <HideWalletTxButton userId={user.id} txId={tx.id} /> : null}
                </Td>
              </tr>
              ))}
            </AdminTable>
          </>
        )}
      </Panel>

      <Panel
        title="Withdraw history"
        description="Payouts released from this wallet."
        className="mt-6"
      >
        {withdrawals.length === 0 ? (
          <EmptyState
            icon={ArrowUpRight}
            title="No withdrawals yet"
            description="Payouts you receive from RushOrder PH will be listed here."
          />
        ) : (
          <AdminTable head={["When", "Reference", "Amount", "Balance after", "Status"]}>
            {withdrawals.map((tx) => (
              <tr key={tx.id}>
                <Td className="text-xs text-muted-foreground">{dateTime(tx.created_at)}</Td>
                <Td className="font-mono text-xs">{tx.reference ?? "—"}</Td>
                <Td className="text-sm font-semibold">{peso(tx.amount)}</Td>
                <Td className="text-sm">{peso(tx.new_balance)}</Td>
                <Td>
                  <Pill tone={statusTone(tx.status)}>{tx.status}</Pill>
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>

      <TopupDialog open={topupOpen} onOpenChange={setTopupOpen} walletType={walletType} />
    </>
  );
}

function CancelTopupButton({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => cancelTopup(id),
    onSuccess: () => {
      toast.success("Top-up request cancelled");
      void queryClient.invalidateQueries({ queryKey: ["wallet-topups"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {mutation.isPending ? "Cancelling…" : "Cancel"}
    </Button>
  );
}

function HideWalletTxButton({ userId, txId }: { userId: string; txId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => hideWalletTransaction({ userId, transactionId: txId }),
    onSuccess: () => {
      toast.success("Transaction hidden from your history");
      void queryClient.invalidateQueries({ queryKey: ["wallet-transactions"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      <EyeOff className="size-3.5" />
      Hide
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Top-up wizard: amount → method → instructions/QR → proof → submit   */
/* ------------------------------------------------------------------ */

function TopupDialog({
  open,
  onOpenChange,
  walletType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletType: WalletType;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: methods, isLoading } = useQuery(activePaymentMethodsQuery());

  const [amount, setAmount] = useState("");
  const [methodId, setMethodId] = useState<string | null>(null);
  const [reference, setReference] = useState("");
  const [proofPath, setProofPath] = useState<string | null>(null);

  const method = (methods ?? []).find((m) => m.id === methodId) ?? null;

  function reset() {
    setAmount("");
    setMethodId(null);
    setReference("");
    setProofPath(null);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Please sign in again.");
      if (!method) throw new Error("Select a payment method.");
      await submitTopup({
        userId: user.id,
        walletType,
        method,
        amount: Number(amount),
        referenceNumber: reference,
        proofPath,
      });
    },
    onSuccess: () => {
      toast.success("Top-up request submitted", {
        description: "We'll credit your wallet once an administrator verifies your payment.",
      });
      void queryClient.invalidateQueries({ queryKey: ["wallet-topups"] });
      reset();
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error("Could not submit top-up", { description: error.message }),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Top-up wallet</DialogTitle>
          <DialogDescription>
            Pay using one of the channels below, then submit your receipt. Requests stay pending
            until an administrator approves them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Field label={`Amount (minimum ₱${MIN_TOPUP})`}>
            <Input
              type="number"
              inputMode="decimal"
              min={MIN_TOPUP}
              placeholder="500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>

          <Field label="Payment method">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading payment methods…</p>
            ) : (methods ?? []).length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
                No payment methods are available right now. Please try again later.
              </p>
            ) : (
              <div className="grid gap-2">
                {(methods ?? []).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethodId(m.id)}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                      methodId === m.id
                        ? "border-primary bg-primary-soft/50"
                        : "border-border hover:border-primary/50",
                    )}
                  >
                    <span className="block font-semibold">{m.name}</span>
                    {m.account_number ? (
                      <span className="block text-xs text-muted-foreground">
                        {m.account_name ? `${m.account_name} · ` : ""}
                        {m.account_number}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {method ? <PaymentInstructions method={method} /> : null}

          {method ? (
            <>
              <Field label="Reference number">
                <Input
                  placeholder="e.g. 0029384756"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </Field>

              <Field label="Proof of payment">
                <ProofUpload userId={user?.id} value={proofPath} onUploaded={setProofPath} />
              </Field>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !method || !amount || !reference || !proofPath}
          >
            {mutation.isPending ? "Submitting…" : "Submit top-up request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentInstructions({ method }: { method: PaymentMethodRow }) {
  return (
    <div className="rounded-2xl border border-border bg-secondary/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
          <StorageImage
            bucket={BUCKETS.paymentQr}
            path={method.qr_image_path}
            alt={`${method.name} QR code`}
            className="size-40"
            fallback={
              <span className="flex flex-col items-center gap-1 p-3 text-center text-[11px] text-muted-foreground">
                <QrCode className="size-6" />
                No QR uploaded
              </span>
            }
          />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {method.account_name ? (
            <CopyRow label="Account name" value={method.account_name} />
          ) : null}
          {method.account_number ? (
            <CopyRow label="Account number" value={method.account_number} />
          ) : null}
          {method.instructions ? (
            <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {method.instructions}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(value);
          toast.success(`${label} copied`);
        }}
      >
        <Copy className="size-3.5" />
      </Button>
    </div>
  );
}

function ProofUpload({
  userId,
  value,
  onUploaded,
}: {
  userId: string | undefined;
  value: string | null;
  onUploaded: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file || !userId) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File is too large", { description: "Please upload a file smaller than 8 MB." });
      return;
    }
    setBusy(true);
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${userId}/topups/${crypto.randomUUID()}.${ext || "jpg"}`;
    const { error } = await supabase.storage
      .from(BUCKETS.paymentProofs)
      .upload(path, file, { upsert: false, contentType: file.type });
    setBusy(false);
    if (error) {
      toast.error("Upload failed", { description: error.message });
      return;
    }
    onUploaded(path);
    toast.success("Proof uploaded securely");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-dashed border-input bg-secondary/40 px-4 py-3.5 text-left text-sm transition-colors hover:border-primary",
          value && "border-success/50 bg-success/10",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-primary">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ReceiptText className="size-4" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">
            {busy
              ? "Uploading…"
              : value
                ? "Receipt uploaded — tap to replace"
                : "Upload receipt screenshot"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {value ? value.split("/").pop() : "JPG, PNG or PDF up to 8 MB"}
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}
