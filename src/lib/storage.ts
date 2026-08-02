import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { adminSignedUrlFn } from "./admin/data.functions";

/** Buckets used across RushOrder PH. Keep this list in sync with the storage policies. */
export const BUCKETS = {
  verificationDocuments: "verification-documents",
  sellerDocuments: "verification-documents",
  riderDocuments: "verification-documents",
  storeLogos: "store-logos",
  storeBanners: "store-banners",
  productImages: "product-images",
  customerAvatars: "customer-avatars",
  chatImages: "chat-images",
  paymentProofs: "payment-proofs",
  paymentQr: "payment-qr",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function isRemoteUrl(value: string | null | undefined): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export function validateImage(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, WebP or AVIF image.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image is too large. Please keep it under 5 MB.";
  }
  return null;
}

/**
 * Uploads an image into a per-user folder and removes the file it replaces.
 * Returns the storage path (not a URL) so images stay bucket-relative.
 */
export async function uploadImage(options: {
  bucket: BucketName;
  userId: string;
  folder: string;
  file: File;
  previousPath?: string | null;
}): Promise<string> {
  const { bucket, userId, folder, file, previousPath } = options;
  const invalid = validateImage(file);
  if (invalid) throw new Error(invalid);

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${folder}/${crypto.randomUUID()}.${ext || "jpg"}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (error) throw error;

  // Best-effort cleanup of the replaced file — never block the upload on it.
  if (previousPath && !isRemoteUrl(previousPath) && previousPath !== path) {
    void supabase.storage.from(bucket).remove([previousPath]);
  }

  return path;
}

export async function removeImage(bucket: BucketName, path: string | null | undefined) {
  if (!path || isRemoteUrl(path)) return;
  await supabase.storage.from(bucket).remove([path]);
}

const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Signed URL for a private-bucket object. Remote URLs are passed straight
 * through. Pass `admin` when the viewer is authenticated through the internal
 * admin portal instead of Supabase Auth — the URL is then minted server-side
 * after the portal session and role are verified.
 */
export function signedUrlQuery(bucket: BucketName, path: string | null | undefined, admin = false) {
  return queryOptions({
    queryKey: ["signed-url", bucket, path ?? null, admin],
    enabled: Boolean(path),
    staleTime: (SIGNED_URL_TTL_SECONDS - 300) * 1000,
    gcTime: SIGNED_URL_TTL_SECONDS * 1000,
    queryFn: async (): Promise<string | null> => {
      if (!path) return null;
      if (isRemoteUrl(path)) return path;
      if (admin) return adminSignedUrlFn({ data: { bucket, path } });
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (error) return null;
      return data?.signedUrl ?? null;
    },
  });
}
