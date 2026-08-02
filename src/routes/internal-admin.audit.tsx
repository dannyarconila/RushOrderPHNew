import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { useState } from "react";

import { AdminTable, Td } from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { Input } from "@/components/ui/input";
import { adminAuditLogFn } from "@/lib/admin/auth.functions";

export const Route = createFileRoute("/internal-admin/audit")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const [search, setSearch] = useState("");
  const { data: entries, isLoading } = useQuery({
    queryKey: ["admin", "audit", search],
    queryFn: () => adminAuditLogFn({ data: { search, limit: 200 } }),
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every action taken inside the internal portal, with the administrator and timestamp."
      />

      <Panel title="Recent activity">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by action, e.g. wallet_topup_approved"
          className="mb-4 max-w-sm"
        />
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading audit entries…</p>
        ) : (entries ?? []).length === 0 ? (
          <EmptyState
            icon={History}
            title="Nothing logged yet"
            description="Portal actions will appear here."
          />
        ) : (
          <AdminTable head={["When", "Administrator", "Action", "Entity", "Details"]}>
            {(entries ?? []).map((entry) => (
              <tr key={entry.id} className="border-t border-border align-top">
                <Td className="whitespace-nowrap text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString("en-PH")}
                </Td>
                <Td className="text-sm font-semibold">{entry.admin_username ?? "—"}</Td>
                <Td className="text-sm">{entry.action.replace(/_/g, " ")}</Td>
                <Td className="text-xs text-muted-foreground">
                  {entry.entity_type ?? "—"}
                  {entry.entity_id ? (
                    <span className="block truncate">{entry.entity_id}</span>
                  ) : null}
                </Td>
                <Td className="max-w-xs text-xs text-muted-foreground">
                  {Object.entries(entry.details ?? {}).length === 0
                    ? "—"
                    : Object.entries(entry.details)
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(", ")}
                </Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>
    </>
  );
}
