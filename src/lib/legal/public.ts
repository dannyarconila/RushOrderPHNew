import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

import {
  DEFAULT_LEGAL_VERSIONS,
  LEGAL_CENTER_LAST_UPDATED,
  LEGAL_DOCUMENTS,
  LEGAL_BY_SLUG,
  mergeLegalDocument,
  type LegalDocVersion,
  type LegalDocumentResolved,
  type LegalSlug,
} from "./catalog";

const VERSION_KEYS = {
  terms: "legal_terms_version",
  privacy: "legal_privacy_version",
  sellerTerms: "legal_seller_terms_version",
  riderTerms: "legal_rider_terms_version",
} as const;

const DOC_KEY_PREFIX = "legal_doc_";

function asVersion(raw: unknown, fallback: string) {
  return typeof raw === "string" && raw.trim() ? raw : fallback;
}

function asDate(raw: unknown) {
  return typeof raw === "string" && raw.trim() ? raw : LEGAL_CENTER_LAST_UPDATED;
}

function asDocVersion(slug: LegalSlug, value: unknown): LegalDocVersion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const fallbackVersion =
    slug === "terms-conditions"
      ? DEFAULT_LEGAL_VERSIONS.terms
      : slug === "privacy-policy"
        ? DEFAULT_LEGAL_VERSIONS.privacy
        : slug === "seller-terms-conditions"
          ? DEFAULT_LEGAL_VERSIONS.sellerTerms
          : slug === "rider-terms-conditions"
            ? DEFAULT_LEGAL_VERSIONS.riderTerms
            : "1.0.0";

  return {
    version: asVersion(row.version, fallbackVersion),
    publishedAt: asDate(row.publishedAt),
    updatedAt: asDate(row.updatedAt),
    updatedBy: asVersion(row.updatedBy, "RushOrder PH Legal Team"),
    content: typeof row.content === "string" ? row.content : null,
  };
}

async function legalSettingsMap() {
  const keys = [
    ...Object.values(VERSION_KEYS),
    ...LEGAL_DOCUMENTS.map((doc) => `${DOC_KEY_PREFIX}${doc.slug}`),
  ];

  const { data, error } = await supabase
    .from("system_settings")
    .select("key,value")
    .in("key", keys)
    .eq("is_public", true);

  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.key, row.value]));
}

function resolvedVersion(
  slug: LegalSlug,
  map: Map<string, unknown>,
  fallback: LegalDocVersion,
): LegalDocVersion {
  const fromDoc = asDocVersion(slug, map.get(`${DOC_KEY_PREFIX}${slug}`));
  if (fromDoc) return fromDoc;
  return fallback;
}

export interface LegalVersionSnapshot {
  termsVersion: string;
  privacyVersion: string;
  sellerTermsVersion: string;
  riderTermsVersion: string;
}

async function fetchLegalVersionSnapshot(): Promise<LegalVersionSnapshot> {
  const map = await legalSettingsMap();

  return {
    termsVersion: asVersion(map.get(VERSION_KEYS.terms), DEFAULT_LEGAL_VERSIONS.terms),
    privacyVersion: asVersion(map.get(VERSION_KEYS.privacy), DEFAULT_LEGAL_VERSIONS.privacy),
    sellerTermsVersion: asVersion(
      map.get(VERSION_KEYS.sellerTerms),
      DEFAULT_LEGAL_VERSIONS.sellerTerms,
    ),
    riderTermsVersion: asVersion(
      map.get(VERSION_KEYS.riderTerms),
      DEFAULT_LEGAL_VERSIONS.riderTerms,
    ),
  };
}

export function legalVersionSnapshotQuery() {
  return queryOptions({
    queryKey: ["legal-version-snapshot"],
    staleTime: 60_000,
    queryFn: fetchLegalVersionSnapshot,
  });
}

export function legalCenterQuery() {
  return queryOptions({
    queryKey: ["legal-center"],
    staleTime: 60_000,
    queryFn: async (): Promise<LegalDocumentResolved[]> => {
      const map = await legalSettingsMap();
      const versions = await fetchLegalVersionSnapshot();

      return LEGAL_DOCUMENTS.map((doc) => {
        const fallback: LegalDocVersion = {
          version:
            doc.slug === "terms-conditions"
              ? versions.termsVersion
              : doc.slug === "privacy-policy"
                ? versions.privacyVersion
                : doc.slug === "seller-terms-conditions"
                  ? versions.sellerTermsVersion
                  : doc.slug === "rider-terms-conditions"
                    ? versions.riderTermsVersion
                    : "1.0.0",
          publishedAt: LEGAL_CENTER_LAST_UPDATED,
          updatedAt: LEGAL_CENTER_LAST_UPDATED,
          updatedBy: "RushOrder PH Legal Team",
          content: null,
        };
        return mergeLegalDocument(doc.slug, resolvedVersion(doc.slug, map, fallback));
      });
    },
  });
}

export function legalDocumentQuery(slug: string) {
  return queryOptions({
    queryKey: ["legal-document", slug],
    queryFn: async (): Promise<LegalDocumentResolved | null> => {
      if (!(slug in LEGAL_BY_SLUG)) return null;
      const legalSlug = slug as LegalSlug;
      const map = await legalSettingsMap();
      const versions = await fetchLegalVersionSnapshot();

      const fallback: LegalDocVersion = {
        version:
          legalSlug === "terms-conditions"
            ? versions.termsVersion
            : legalSlug === "privacy-policy"
              ? versions.privacyVersion
              : legalSlug === "seller-terms-conditions"
                ? versions.sellerTermsVersion
                : legalSlug === "rider-terms-conditions"
                  ? versions.riderTermsVersion
                  : "1.0.0",
        publishedAt: LEGAL_CENTER_LAST_UPDATED,
        updatedAt: LEGAL_CENTER_LAST_UPDATED,
        updatedBy: "RushOrder PH Legal Team",
        content: null,
      };

      return mergeLegalDocument(legalSlug, resolvedVersion(legalSlug, map, fallback));
    },
  });
}
