import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import { FileText } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { BUCKETS, signedUrlQuery } from "@/lib/storage";
import { cn } from "@/lib/utils";

export const shortDate = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

export const dateTime = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "—";

export const shortId = (value: string | null | undefined) =>
  value ? `${value.slice(0, 8)}…` : "—";

const TONES = {
  neutral: "bg-secondary text-secondary-foreground border-border",
  warning: "bg-warning/15 text-warning-foreground border-warning/40",
  success: "bg-success/15 text-success border-success/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-primary-soft text-primary border-primary/30",
} as const;

export type PillTone = keyof typeof TONES;

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize",
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function statusTone(status: string): PillTone {
  if (["approved", "verified", "active", "delivered", "succeeded"].includes(status))
    return "success";
  if (["pending", "under_review", "preparing", "processing", "ready"].includes(status))
    return "warning";
  if (["rejected", "banned", "cancelled", "failed", "suspended", "expired"].includes(status))
    return "danger";
  return "info";
}

export function AdminTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {head.map((h) => (
              <th
                key={h}
                className="whitespace-nowrap py-2.5 pr-4 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("py-3 pr-4 align-middle", className)}>{children}</td>;
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-xs font-bold capitalize transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 max-w-xs"
    />
  );
}

/** Confirmation dialog with an optional note that is stored on the record. */
export function ActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive,
  noteLabel,
  requireNote,
  amountLabel,
  defaultAmount,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  destructive?: boolean;
  noteLabel?: string;
  requireNote?: boolean;
  amountLabel?: string;
  defaultAmount?: number;
  pending?: boolean;
  onConfirm: (note: string, amount?: number) => void;
}) {
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState(String(defaultAmount ?? 0));
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setNote("");
          setAmount(String(defaultAmount ?? 0));
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {noteLabel ? (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {noteLabel}
            </label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
          </div>
        ) : null}
        {amountLabel ? (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {amountLabel}
            </label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending || (requireNote && note.trim().length === 0)}
            onClick={() => onConfirm(note.trim(), amountLabel ? Number(amount) : undefined)}
          >
            {pending ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentLink({ label, path }: { label: string; path: string }) {
  const { data: url } = useQuery(signedUrlQuery(BUCKETS.verificationDocuments, path, true));
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold capitalize",
        url ? "hover:bg-secondary" : "pointer-events-none opacity-60",
      )}
    >
      <FileText className="size-3.5" /> {label}
    </a>
  );
}

export function DocumentList({ docs }: { docs: { label: string; path: string }[] }) {
  if (docs.length === 0)
    return <p className="text-xs text-muted-foreground">No documents uploaded.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {docs.map((doc) => (
        <DocumentLink key={doc.label + doc.path} label={doc.label} path={doc.path} />
      ))}
    </div>
  );
}

export function DetailGrid({ data }: { data: Record<string, string> }) {
  const entries = Object.entries(data).filter(([, v]) => v !== "");
  if (entries.length === 0)
    return <p className="text-xs text-muted-foreground">No details provided.</p>;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {key.replace(/_/g, " ")}
          </dt>
          <dd className="text-sm break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailDialog({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}
