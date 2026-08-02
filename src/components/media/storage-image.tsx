import { useQuery } from "@tanstack/react-query";

import { signedUrlQuery, type BucketName, isRemoteUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Renders an image stored in a private Supabase bucket by resolving a signed URL.
 * Accepts either a bucket-relative storage path or an absolute URL.
 */
export function StorageImage({
  bucket,
  path,
  alt,
  className,
  fallback,
  admin = false,
}: {
  bucket: BucketName;
  path: string | null | undefined;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** Resolve the signed URL through the internal admin portal session. */
  admin?: boolean;
}) {
  const direct = isRemoteUrl(path) ? (path as string) : null;
  const { data } = useQuery({
    ...signedUrlQuery(bucket, path, admin),
    enabled: Boolean(path) && !direct,
  });
  const src = direct ?? data ?? null;

  if (!src) return <>{fallback ?? null}</>;

  return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}
