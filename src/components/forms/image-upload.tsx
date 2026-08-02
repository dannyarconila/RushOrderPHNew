import { Loader2, ImagePlus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { StorageImage } from "@/components/media/storage-image";
import { removeImage, uploadImage, type BucketName } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Reusable image picker for store logos, banners and product photos.
 * Uploads into a per-user folder and deletes the file it replaces.
 */
export function ImageUpload({
  label,
  hint,
  bucket,
  userId,
  folder,
  value,
  onChange,
  aspect = "square",
  disabled,
}: {
  label: string;
  hint?: string;
  bucket: BucketName;
  userId: string;
  folder: string;
  value: string | null;
  onChange: (path: string | null) => void;
  aspect?: "square" | "wide";
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const path = await uploadImage({ bucket, userId, folder, file, previousPath: value });
      onChange(path);
      toast.success(`${label} updated`);
    } catch (error) {
      toast.error("Upload failed", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleClear() {
    const previous = value;
    onChange(null);
    if (previous) void removeImage(bucket, previous);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-secondary/40 text-muted-foreground transition-colors hover:border-primary hover:bg-primary-soft/40 disabled:opacity-60",
            aspect === "wide" ? "h-20 w-36" : "size-20",
          )}
        >
          {value ? (
            <StorageImage bucket={bucket} path={value} alt={label} className="size-full" />
          ) : null}
          {busy ? (
            <span className="absolute inset-0 flex items-center justify-center bg-card/70">
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : value ? null : (
            <ImagePlus className="size-5" />
          )}
        </button>
        <div className="min-w-0 text-xs text-muted-foreground">
          <p>{hint ?? "JPG, PNG or WebP up to 5 MB."}</p>
          {value ? (
            <button
              type="button"
              onClick={() => void handleClear()}
              className="mt-1.5 inline-flex items-center gap-1 font-semibold text-destructive hover:underline"
            >
              <Trash2 className="size-3" />
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
    </div>
  );
}
