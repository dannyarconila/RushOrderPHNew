import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  ActionDialog,
  AdminTable,
  DetailDialog,
  DetailGrid,
  DocumentList,
  FilterBar,
  FilterChip,
  Pill,
  SearchBox,
  Section,
  Td,
  dateTime,
  statusTone,
} from "@/components/admin/primitives";
import { EmptyState, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { setRiderApplicationStatus, setSellerApplicationStatus } from "@/lib/admin/mutations";
import {
  APPLICATION_STATUSES,
  asRecord,
  documentEntries,
  riderApplicationsQuery,
  sellerApplicationsQuery,
  type ApplicationStatus,
  type RiderApplicationRow,
  type SellerApplicationRow,
} from "@/lib/admin/queries";

type AnyApplication = SellerApplicationRow | RiderApplicationRow;

const FILTERS: (ApplicationStatus | "all")[] = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "all",
];

interface Column {
  label: string;
  render: (app: AnyApplication) => ReactNode;
}

function isSeller(app: AnyApplication): app is SellerApplicationRow {
  return "business_type" in app;
}

const SELLER_COLUMNS: Column[] = [
  {
    label: "Business",
    render: (app) => {
      const s = app as SellerApplicationRow;
      const business = asRecord(s.business_info);
      const store = asRecord(s.store_info);
      return (
        <>
          <p className="font-semibold">
            {store.store_name || business.business_name || "Unnamed store"}
          </p>
          <p className="text-xs capitalize text-muted-foreground">
            {s.business_type === "home_based" ? "Home-based" : "Registered business"}
          </p>
        </>
      );
    },
  },
  {
    label: "Owner",
    render: (app) => {
      const owner = asRecord((app as SellerApplicationRow).owner_info);
      return (
        <>
          <p className="text-sm">{owner.full_name || owner.name || "—"}</p>
          <p className="text-xs text-muted-foreground">{owner.phone || owner.email || "—"}</p>
        </>
      );
    },
  },
];

const RIDER_COLUMNS: Column[] = [
  {
    label: "Rider",
    render: (app) => {
      const personal = asRecord((app as RiderApplicationRow).personal_info);
      return (
        <>
          <p className="font-semibold">{personal.full_name || personal.name || "Unnamed rider"}</p>
          <p className="text-xs text-muted-foreground">{personal.phone || "—"}</p>
        </>
      );
    },
  },
  {
    label: "Vehicle / licence",
    render: (app) => {
      const vehicle = asRecord((app as RiderApplicationRow).vehicle_info);
      return (
        <>
          <p className="text-sm capitalize">{vehicle.vehicle_type || vehicle.type || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {vehicle.plate_number || vehicle.plate || "—"} ·{" "}
            {vehicle.license_number || vehicle.licence || "—"}
          </p>
        </>
      );
    },
  },
];

export function ApplicationReview({ kind }: { kind: "seller" | "rider" }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ApplicationStatus | "all">("pending");
  const [search, setSearch] = useState("");
  const [details, setDetails] = useState<AnyApplication | null>(null);
  const [pending, setPending] = useState<{ app: AnyApplication; next: ApplicationStatus } | null>(
    null,
  );

  const sellerQuery = useQuery({ ...sellerApplicationsQuery(status), enabled: kind === "seller" });
  const riderQuery = useQuery({ ...riderApplicationsQuery(status), enabled: kind === "rider" });
  const active = kind === "seller" ? sellerQuery : riderQuery;

  const mutation = useMutation({
    mutationFn: (input: { id: string; status: ApplicationStatus; notes: string | null }) =>
      kind === "seller" ? setSellerApplicationStatus(input) : setRiderApplicationStatus(input),
    onSuccess: () => {
      toast.success("Application updated — the applicant has been notified.");
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      setPending(null);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const columns = kind === "seller" ? SELLER_COLUMNS : RIDER_COLUMNS;

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = (active.data ?? []) as AnyApplication[];
    if (!term) return list;
    return list.filter((app) => JSON.stringify(app).toLowerCase().includes(term));
  }, [active.data, search]);

  return (
    <Panel
      title={`${rows.length} ${kind} application${rows.length === 1 ? "" : "s"}`}
      description="Approve, reject or suspend applications. Approvals provision roles, wallets and dashboards automatically."
    >
      <FilterBar>
        <SearchBox value={search} onChange={setSearch} placeholder="Search applications" />
        {FILTERS.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s.replace(/_/g, " ")}
          </FilterChip>
        ))}
      </FilterBar>

      {active.isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading applications…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Nothing to review"
          description={`There are no ${status === "all" ? "" : status.replace(/_/g, " ") + " "}${kind} applications right now.`}
        />
      ) : (
        <AdminTable
          head={[...columns.map((c) => c.label), "Submitted", "Documents", "Status", "Actions"]}
        >
          {rows.map((app) => {
            const docs = documentEntries(app.documents);
            return (
              <tr key={app.id}>
                {columns.map((column) => (
                  <Td key={column.label}>{column.render(app)}</Td>
                ))}
                <Td className="text-xs text-muted-foreground">{dateTime(app.created_at)}</Td>
                <Td className="text-xs text-muted-foreground">
                  {docs.length ? `${docs.length} file(s)` : "None"}
                </Td>
                <Td>
                  <Pill tone={statusTone(app.status)}>{app.status.replace(/_/g, " ")}</Pill>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setDetails(app)}>
                      Details
                    </Button>
                    {app.status !== "approved" ? (
                      <Button size="sm" onClick={() => setPending({ app, next: "approved" })}>
                        Approve
                      </Button>
                    ) : null}
                    {app.status !== "rejected" ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setPending({ app, next: "rejected" })}
                      >
                        Reject
                      </Button>
                    ) : null}
                    {app.status !== "under_review" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPending({ app, next: "under_review" })}
                      >
                        Suspend
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      <ActionDialog
        open={Boolean(pending)}
        onOpenChange={(open) => !open && setPending(null)}
        title={
          pending?.next === "approved"
            ? `Approve this ${kind}?`
            : pending?.next === "rejected"
              ? `Reject this ${kind} application?`
              : "Move back to review?"
        }
        description={
          pending?.next === "approved"
            ? kind === "seller"
              ? "The seller role, wallet and storefront are created automatically and the applicant is notified."
              : "The rider role and wallet are created automatically and the applicant is notified."
            : "The applicant is notified with your note."
        }
        confirmLabel={
          pending?.next === "approved"
            ? "Approve"
            : pending?.next === "rejected"
              ? "Reject"
              : "Suspend"
        }
        destructive={pending?.next === "rejected"}
        noteLabel="Review note"
        requireNote={pending?.next === "rejected"}
        pending={mutation.isPending}
        onConfirm={(note) =>
          pending &&
          mutation.mutate({ id: pending.app.id, status: pending.next, notes: note || null })
        }
      />

      <DetailDialog
        open={Boolean(details)}
        onOpenChange={(open) => !open && setDetails(null)}
        title={`${kind === "seller" ? "Store" : "Rider"} application`}
      >
        {details ? (
          <>
            {isSeller(details) ? (
              <>
                <Section title="Business">
                  <DetailGrid data={asRecord(details.business_info)} />
                </Section>
                <Section title="Owner">
                  <DetailGrid data={asRecord(details.owner_info)} />
                </Section>
                <Section title="Store">
                  <DetailGrid data={asRecord(details.store_info)} />
                </Section>
              </>
            ) : (
              <>
                <Section title="Personal">
                  <DetailGrid data={asRecord(details.personal_info)} />
                </Section>
                <Section title="Vehicle">
                  <DetailGrid data={asRecord(details.vehicle_info)} />
                </Section>
                <Section title="Emergency contact">
                  <DetailGrid data={asRecord(details.emergency_contact)} />
                </Section>
              </>
            )}
            <Section title="Address">
              <DetailGrid data={asRecord(details.address)} />
            </Section>
            <Section title="Documents">
              <DocumentList docs={documentEntries(details.documents)} />
            </Section>
            <Section title="Review">
              <DetailGrid
                data={{
                  status: details.status,
                  submitted: dateTime(details.created_at),
                  reviewed: dateTime(details.reviewed_at),
                  notes: details.review_notes ?? "—",
                  applicant_id: details.user_id,
                }}
              />
            </Section>
          </>
        ) : null}
      </DetailDialog>
    </Panel>
  );
}
