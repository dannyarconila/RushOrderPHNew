import { Loader2, Paperclip, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const BUCKET = "verification-documents";

export function DocumentUpload({
  label,
  hint,
  value,
  userId,
  folder,
  onUploaded,
}: {
  label: string;
  hint?: string;
  value?: string;
  userId: string;
  folder: string;
  onUploaded: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("File is too large", { description: "Please upload a file smaller than 8 MB." });
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
    setBusy(false);
    if (error) {
      toast.error("Upload failed", { description: error.message });
      return;
    }
    onUploaded(path);
    toast.success(`${label} uploaded securely`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-dashed border-input bg-secondary/40 px-4 py-3.5 text-left text-sm transition-colors hover:border-primary hover:bg-primary-soft/40",
          value && "border-success/50 bg-success/10",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-[var(--shadow-soft)]">
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : value ? (
            <ShieldCheck className="size-4" />
          ) : (
            <Paperclip className="size-4" />
          )}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-foreground">
            {busy ? "Uploading…" : value ? "File uploaded — tap to replace" : "Choose a file"}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {value ? value.split("/").pop() : (hint ?? "JPG, PNG or PDF up to 8 MB")}
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
    </div>
  );
}
