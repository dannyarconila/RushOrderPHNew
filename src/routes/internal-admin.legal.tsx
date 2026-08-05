import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AdminTable, Td, dateTime, shortDate } from "@/components/admin/primitives";
import { PageHeader, Panel, StatCard } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LEGAL_DOCUMENTS, type LegalSlug } from "@/lib/legal/catalog";
import { publishLegalDocument } from "@/lib/admin/mutations";
import { legalAcceptanceLogsQuery, legalDocumentsQuery } from "@/lib/admin/queries";
import { ShieldCheck, ScrollText, Users } from "lucide-react";

export const Route = createFileRoute("/internal-admin/legal")({
  component: InternalAdminLegalPage,
});

function InternalAdminLegalPage() {
  const queryClient = useQueryClient();
  const docsQuery = useQuery(legalDocumentsQuery());
  const logsQuery = useQuery(legalAcceptanceLogsQuery(500));

  const [selectedSlug, setSelectedSlug] = useState(LEGAL_DOCUMENTS[0].slug);
  const selectedTemplate =
    LEGAL_DOCUMENTS.find((doc) => doc.slug === selectedSlug) ?? LEGAL_DOCUMENTS[0];
  const stored = (docsQuery.data ?? []).find((row) => row.slug === selectedSlug);

  const [title, setTitle] = useState(selectedTemplate.title);
  const [summary, setSummary] = useState(selectedTemplate.summary);
  const [version, setVersion] = useState(stored?.version ?? "1.0.0");
  const [content, setContent] = useState(stored?.content ?? "");
  const [adminName, setAdminName] = useState("Internal Admin");

  useEffect(() => {
    const row = (docsQuery.data ?? []).find((doc) => doc.slug === selectedSlug);
    setTitle(row?.title ?? selectedTemplate.title);
    setSummary(row?.summary ?? selectedTemplate.summary);
    setVersion(row?.version ?? "1.0.0");
    setContent(row?.content ?? "");
  }, [docsQuery.data, selectedSlug, selectedTemplate.summary, selectedTemplate.title]);

  const logs = logsQuery.data ?? [];
  const stats = useMemo(() => {
    const byAudience = {
      customer: 0,
      seller: 0,
      rider: 0,
    };
    for (const row of logs) {
      if (row.audience === "customer") byAudience.customer += 1;
      if (row.audience === "seller") byAudience.seller += 1;
      if (row.audience === "rider") byAudience.rider += 1;
    }
    return byAudience;
  }, [logs]);

  const publish = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      await publishLegalDocument({
        slug: selectedSlug,
        title: title.trim() || selectedTemplate.title,
        summary: summary.trim() || selectedTemplate.summary,
        version: version.trim() || "1.0.0",
        content: content.trim(),
        updatedBy: adminName.trim() || "Internal Admin",
        publishedAt: now,
        updatedAt: now,
      });
    },
    onSuccess: () => {
      toast.success("Legal document published");
      void queryClient.invalidateQueries({ queryKey: ["admin", "legal-documents"] });
      void queryClient.invalidateQueries({ queryKey: ["legal-center"] });
      void queryClient.invalidateQueries({ queryKey: ["legal-document"] });
      void queryClient.invalidateQueries({ queryKey: ["legal-version-snapshot"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function selectDoc(slug: LegalSlug) {
    setSelectedSlug(slug);
    const tmpl = LEGAL_DOCUMENTS.find((doc) => doc.slug === slug);
    const row = (docsQuery.data ?? []).find((doc) => doc.slug === slug);
    setTitle(row?.title ?? tmpl?.title ?? "");
    setSummary(row?.summary ?? tmpl?.summary ?? "");
    setVersion(row?.version ?? "1.0.0");
    setContent(row?.content ?? "");
  }

  return (
    <>
      <PageHeader
        title="Legal Management"
        description="Publish legal document versions, update policy content, and monitor acceptance history."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Customer accepts" value={String(stats.customer)} icon={Users} />
        <StatCard label="Seller accepts" value={String(stats.seller)} icon={ShieldCheck} />
        <StatCard label="Rider accepts" value={String(stats.rider)} icon={ShieldCheck} />
        <StatCard label="Total logs" value={String(logs.length)} icon={ScrollText} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <Panel title="Policies" description="Select a legal document to edit and publish.">
          <div className="flex flex-col gap-2">
            {LEGAL_DOCUMENTS.map((doc) => (
              <button
                key={doc.slug}
                type="button"
                onClick={() => selectDoc(doc.slug)}
                className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                  selectedSlug === doc.slug
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border hover:bg-secondary"
                }`}
              >
                <p className="font-semibold">{doc.title}</p>
                <p className="text-xs text-muted-foreground">{doc.slug}</p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          title="Document editor"
          description="Update document text, version metadata, and publish."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Version">
              <Input
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. 1.1.0"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Admin">
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
            </Field>
            <Field label="Summary">
              <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
            </Field>
          </div>

          <Field label="Document content" className="mt-4">
            <Textarea
              rows={14}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write policy content. Separate paragraphs with blank lines."
            />
          </Field>

          <div className="mt-4 flex justify-end">
            <Button onClick={() => publish.mutate()} disabled={publish.isPending}>
              {publish.isPending ? "Publishing…" : "Publish new version"}
            </Button>
          </div>
        </Panel>
      </div>

      <Panel
        title="Acceptance logs"
        description="Recent user legal acceptances with versions and source context."
        className="mt-6"
      >
        {logsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading acceptance logs…</p>
        ) : (
          <AdminTable
            head={["Accepted at", "Audience", "User", "Terms version", "Privacy version", "Source"]}
          >
            {logs.map((row) => (
              <tr key={row.id}>
                <Td>{dateTime(row.accepted_at)}</Td>
                <Td className="capitalize">{row.audience}</Td>
                <Td>{row.user_id ?? "—"}</Td>
                <Td>{row.terms_version}</Td>
                <Td>{row.privacy_version}</Td>
                <Td>{row.source}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Latest document update: {shortDate((docsQuery.data ?? [])[0]?.updated_at ?? null)}
        </p>
      </Panel>
    </>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
