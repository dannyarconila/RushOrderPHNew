import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Loader2, Plus, QrCode, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Pill } from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
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
import { Textarea } from "@/components/ui/textarea";
import { adminUploadFn } from "@/lib/admin/data.functions";
import { BUCKETS } from "@/lib/storage";
import {
  allPaymentMethodsQuery,
  deletePaymentMethod,
  savePaymentMethod,
  type PaymentMethodInput,
  type PaymentMethodRow,
} from "@/lib/wallet";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/internal-admin/payment-methods")({
  component: PaymentMethodsPage,
});

const BLANK: PaymentMethodInput = {
  code: "",
  name: "",
  account_name: "",
  account_number: "",
  qr_image_path: null,
  instructions: "",
  is_active: true,
  sort_order: 10,
};

function PaymentMethodsPage() {
  const { data: methods, isLoading } = useQuery(allPaymentMethodsQuery());
  const [editing, setEditing] = useState<PaymentMethodInput | null>(null);

  return (
    <>
      <PageHeader
        title="Payment methods"
        description="Channels sellers and riders can use to top up their wallets. Nothing is hardcoded — every detail below comes from the database."
        action={
          <Button onClick={() => setEditing({ ...BLANK })}>
            <Plus className="size-4" /> Add payment method
          </Button>
        }
      />

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading payment methods…</p>
      ) : (methods ?? []).length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payment methods yet"
          description="Add GCash, Maya or a bank account so partners can fund their wallets."
          action={<Button onClick={() => setEditing({ ...BLANK })}>Add payment method</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(methods ?? []).map((method) => (
            <MethodCard key={method.id} method={method} onEdit={setEditing} />
          ))}
        </div>
      )}

      <MethodDialog value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function MethodCard({
  method,
  onEdit,
}: {
  method: PaymentMethodRow;
  onEdit: (value: PaymentMethodInput) => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deletePaymentMethod(method.id),
    onSuccess: () => {
      toast.success(`${method.name} removed`);
      void queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggle = useMutation({
    mutationFn: () => savePaymentMethod({ ...toInput(method), is_active: !method.is_active }),
    onSuccess: () => {
      toast.success(method.is_active ? `${method.name} deactivated` : `${method.name} activated`);
      void queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Panel
      title={method.name}
      description={method.code}
      action={
        <Pill tone={method.is_active ? "success" : "neutral"}>
          {method.is_active ? "active" : "inactive"}
        </Pill>
      }
    >
      <div className="flex gap-4">
        <div className="flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/40">
          <StorageImage
            bucket={BUCKETS.paymentQr}
            path={method.qr_image_path}
            admin
            alt={`${method.name} QR code`}
            className="size-28"
            fallback={<QrCode className="size-6 text-muted-foreground" />}
          />
        </div>
        <div className="min-w-0 flex-1 space-y-1 text-sm">
          <p className="font-semibold">{method.account_name ?? "No account name"}</p>
          <p className="text-muted-foreground">{method.account_number ?? "No account number"}</p>
          {method.instructions ? (
            <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
              {method.instructions}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onEdit(toInput(method))}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {method.is_active ? "Deactivate" : "Activate"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>
    </Panel>
  );
}

function toInput(method: PaymentMethodRow): PaymentMethodInput {
  return {
    id: method.id,
    code: method.code,
    name: method.name,
    account_name: method.account_name,
    account_number: method.account_number,
    qr_image_path: method.qr_image_path,
    instructions: method.instructions,
    is_active: method.is_active,
    sort_order: method.sort_order,
  };
}

function MethodDialog({
  value,
  onClose,
}: {
  value: PaymentMethodInput | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<PaymentMethodInput | null>(value);

  // Sync when a different method is opened.
  if (value?.id !== draft?.id || (value && !draft) || (!value && draft)) {
    if (value !== draft) setDraft(value);
  }

  const save = useMutation({
    mutationFn: () => savePaymentMethod(draft!),
    onSuccess: () => {
      toast.success("Payment method saved");
      void queryClient.invalidateQueries({ queryKey: ["payment-methods"] });
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!draft) return null;
  const set = (patch: Partial<PaymentMethodInput>) => setDraft({ ...draft, ...patch });

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit payment method" : "Add payment method"}</DialogTitle>
          <DialogDescription>
            Only active methods are offered to sellers and riders during wallet top-up.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name">
              <Input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="GCash"
              />
            </Field>
            <Field label="Code">
              <Input
                value={draft.code}
                onChange={(e) => set({ code: e.target.value })}
                placeholder="gcash"
              />
            </Field>
            <Field label="Account name">
              <Input
                value={draft.account_name ?? ""}
                onChange={(e) => set({ account_name: e.target.value })}
                placeholder="RushOrder PH"
              />
            </Field>
            <Field label="Account number">
              <Input
                value={draft.account_number ?? ""}
                onChange={(e) => set({ account_number: e.target.value })}
                placeholder="0900 000 0000"
              />
            </Field>
            <Field label="Sort order">
              <Input
                type="number"
                value={String(draft.sort_order)}
                onChange={(e) => set({ sort_order: Number(e.target.value) || 0 })}
              />
            </Field>
            <Field label="Status">
              <Button
                type="button"
                variant={draft.is_active ? "default" : "outline"}
                onClick={() => set({ is_active: !draft.is_active })}
              >
                {draft.is_active ? "Active" : "Inactive"}
              </Button>
            </Field>
          </div>

          <Field label="Payment instructions">
            <Textarea
              rows={5}
              value={draft.instructions ?? ""}
              onChange={(e) => set({ instructions: e.target.value })}
              placeholder="Step-by-step instructions shown to the payer."
            />
          </Field>

          <Field label="QR code image">
            <QrUpload
              value={draft.qr_image_path}
              onUploaded={(path) => set({ qr_image_path: path })}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save payment method"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QrUpload({
  value,
  onUploaded,
}: {
  value: string | null;
  onUploaded: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() ?? "png").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `methods/${crypto.randomUUID()}.${ext || "png"}`;
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of buffer) binary += String.fromCharCode(byte);
      await adminUploadFn({
        data: {
          bucket: BUCKETS.paymentQr,
          path,
          contentType: file.type || "image/png",
          base64: btoa(binary),
        },
      });
      onUploaded(path);
      toast.success("QR code uploaded");
    } catch (error) {
      toast.error("Upload failed", { description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex size-24 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary/40">
        <StorageImage
          bucket={BUCKETS.paymentQr}
          path={value}
          admin
          alt="QR code preview"
          className="size-24"
          fallback={<QrCode className="size-5 text-muted-foreground" />}
        />
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "flex-1 rounded-xl border border-dashed border-input bg-secondary/40 px-4 py-3 text-left text-sm hover:border-primary",
        )}
      >
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Uploading…
          </span>
        ) : value ? (
          "Replace QR image"
        ) : (
          "Upload QR image"
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
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
