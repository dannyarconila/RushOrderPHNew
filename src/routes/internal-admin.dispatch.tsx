import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { Radar } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AdminTable,
  Pill,
  Td,
  dateTime,
  peso,
  shortId,
  statusTone,
} from "@/components/admin/primitives";
import { EmptyState, PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminReadFn } from "@/lib/admin/data.functions";
import { upsertSetting } from "@/lib/admin/mutations";
import type { Database } from "@/integrations/supabase/types";
import { DISPATCH_SETTING_KEYS } from "@/lib/dispatch";

type DispatchJobRow = Database["public"]["Tables"]["dispatch_jobs"]["Row"];
type RiderStatusRow = Database["public"]["Tables"]["rider_status"]["Row"];
type SettingRow = Database["public"]["Tables"]["system_settings"]["Row"];

export const Route = createFileRoute("/internal-admin/dispatch")({
  component: DispatchPage,
});

const LABELS: Record<string, string> = {
  dispatch_radius_km: "Initial search radius (km)",
  dispatch_max_radius_km: "Maximum radius (km)",
  dispatch_fee_per_km: "Delivery fee per km (PHP)",
  dispatch_min_fee: "Minimum delivery fee (PHP)",
  dispatch_max_fee: "Maximum delivery fee (PHP)",
  dispatch_timeout_seconds: "Rider response timeout (seconds)",
  dispatch_retry_interval_seconds: "Retry interval (seconds)",
  dispatch_max_retries: "Maximum dispatch attempts",
  dispatch_auto_expand: "Auto-expand radius between retries (true/false)",
  dispatch_radius_expansion_km: "Radius added per retry (km)",
  dispatch_strategy: "Strategy (nearest_first | wave | broadcast)",
};

function dispatchJobsQuery() {
  return queryOptions({
    queryKey: ["admin", "dispatch-jobs"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const result = await adminReadFn({
        data: {
          table: "dispatch_jobs",
          order: [{ column: "created_at", ascending: false }],
          limit: 100,
        },
      });
      return (result.rows ?? []) as DispatchJobRow[];
    },
  });
}

function ridersOnlineQuery() {
  return queryOptions({
    queryKey: ["admin", "rider-status"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const result = await adminReadFn({
        data: {
          table: "rider_status",
          order: [{ column: "last_seen_at", ascending: false }],
          limit: 200,
        },
      });
      return (result.rows ?? []) as RiderStatusRow[];
    },
  });
}

function dispatchSettingsRowsQuery() {
  return queryOptions({
    queryKey: ["admin", "dispatch-settings"],
    queryFn: async () => {
      const result = await adminReadFn({
        data: {
          table: "system_settings",
          filters: [{ column: "key", op: "in", value: [...DISPATCH_SETTING_KEYS] }],
          order: [{ column: "key", ascending: true }],
        },
      });
      return (result.rows ?? []) as SettingRow[];
    },
  });
}

function DispatchPage() {
  const { data: jobs, isLoading } = useQuery(dispatchJobsQuery());
  const { data: riders } = useQuery(ridersOnlineQuery());
  const { data: settings } = useQuery(dispatchSettingsRowsQuery());

  const list = jobs ?? [];
  const searching = list.filter((job) => job.status === "searching");
  const live = list.filter((job) => job.status === "assigned" || job.status === "picked_up");
  const pasugoSearching = list.filter((job) => job.dispatch_type === "pasugo" && job.status === "searching");
  const pasugoLive = list.filter(
    (job) => job.dispatch_type === "pasugo" && (job.status === "assigned" || job.status === "picked_up"),
  );
  const online = (riders ?? []).filter((rider) => rider.is_online);

  return (
    <>
      <PageHeader
        title="Rider dispatch"
        description="Live booking assignments, rider availability and the automated dispatch rules."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric label="Searching for a rider" value={searching.length} />
        <Metric label="Deliveries in progress" value={live.length} />
        <Metric label="Riders online" value={online.length} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Metric label="Pasugo bookings searching" value={pasugoSearching.length} />
        <Metric label="Pasugo bookings in progress" value={pasugoLive.length} />
      </div>

      <Panel
        title="Dispatch rules"
        description="Applied instantly to every new booking."
        className="mt-6"
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {(settings ?? []).map((setting) => (
            <SettingField key={setting.key} setting={setting} />
          ))}
        </div>
      </Panel>

      <Panel title="Dispatch activity" description="Most recent 100 bookings." className="mt-6">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading dispatch activity…
          </p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Radar}
            title="No dispatch activity yet"
            description="Bookings appear here once a store marks an order ready for pickup."
          />
        ) : (
          <AdminTable
            head={["Order", "Store", "Distance", "Fee", "Attempt", "Rider", "Status", "Created"]}
          >
            {list.map((job) => (
              <tr key={job.id}>
                <Td className="text-xs text-muted-foreground">{shortId(job.order_id)}</Td>
                <Td className="text-sm">{job.store_name ?? "—"}</Td>
                <Td className="text-sm">{Number(job.distance_km).toFixed(1)} km</Td>
                <Td className="text-sm">{peso(Number(job.delivery_fee))}</Td>
                <Td className="text-xs text-muted-foreground">
                  {job.attempt}/{job.max_attempts} · {Number(job.radius_km).toFixed(0)} km
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {job.assigned_rider_id ? shortId(job.assigned_rider_id) : "—"}
                </Td>
                <Td>
                  <Pill tone={statusTone(job.status)}>{job.status.replace(/_/g, " ")}</Pill>
                </Td>
                <Td className="text-xs text-muted-foreground">{dateTime(job.created_at)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>

      <Panel
        title="Pasugo dispatch activity"
        description="Most recent 100 standalone rider bookings."
        className="mt-6"
      >
        {pasugoList.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No Pasugo dispatch activity yet.
          </p>
        ) : (
          <AdminTable
            head={[
              "Order",
              "Pickup",
              "Drop-off",
              "Distance",
              "Fare",
              "Attempt",
              "Rider",
              "Status",
              "Created",
            ]}
          >
            {list
              .filter((job) => job.dispatch_type === "pasugo")
              .map((job) => (
              <tr key={job.id}>
                <Td className="text-xs text-muted-foreground">{shortId(job.order_id)}</Td>
                <Td className="text-sm">{job.pickup_address ?? "—"}</Td>
                <Td className="text-sm">{job.dropoff_address ?? "—"}</Td>
                <Td className="text-sm">{Number(job.distance_km).toFixed(1)} km</Td>
                <Td className="text-sm">{peso(Number(job.delivery_fee))}</Td>
                <Td className="text-xs text-muted-foreground">
                  {job.attempt}/{job.max_attempts} · {Number(job.radius_km).toFixed(0)} km
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {job.assigned_rider_id ? shortId(job.assigned_rider_id) : "—"}
                </Td>
                <Td>
                  <Pill tone={statusTone(job.status)}>{job.status.replace(/_/g, " ")}</Pill>
                </Td>
                <Td className="text-xs text-muted-foreground">{dateTime(job.created_at)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>

      <Panel
        title="Rider availability"
        description="Presence reported by the rider app."
        className="mt-6"
      >
        {(riders ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No rider presence recorded yet.
          </p>
        ) : (
          <AdminTable head={["Rider", "Online", "Available", "Location", "Last seen"]}>
            {(riders ?? []).map((rider) => (
              <tr key={rider.user_id}>
                <Td className="text-xs text-muted-foreground">{shortId(rider.user_id)}</Td>
                <Td>
                  <Pill tone={rider.is_online ? "success" : "neutral"}>
                    {rider.is_online ? "online" : "offline"}
                  </Pill>
                </Td>
                <Td>
                  <Pill tone={rider.is_available ? "success" : "warning"}>
                    {rider.is_available ? "available" : "on a delivery"}
                  </Pill>
                </Td>
                <Td className="text-xs text-muted-foreground">
                  {rider.latitude != null && rider.longitude != null
                    ? `${Number(rider.latitude).toFixed(3)}, ${Number(rider.longitude).toFixed(3)}`
                    : "not shared"}
                </Td>
                <Td className="text-xs text-muted-foreground">{dateTime(rider.last_seen_at)}</Td>
              </tr>
            ))}
          </AdminTable>
        )}
      </Panel>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{value}</p>
    </div>
  );
}

function SettingField({ setting }: { setting: SettingRow }) {
  const queryClient = useQueryClient();
  const initial = JSON.stringify(setting.value);
  const [draft, setDraft] = useState(initial);

  useEffect(() => setDraft(initial), [initial]);

  const mutation = useMutation({
    mutationFn: upsertSetting,
    onSuccess: () => {
      toast.success("Dispatch rule updated");
      void queryClient.invalidateQueries({ queryKey: ["admin", "dispatch-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["dispatch-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error('Enter a valid value (e.g. 12, true or "nearest_first").');
      return;
    }
    mutation.mutate({ key: setting.key, value: parsed });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">{LABELS[setting.key] ?? setting.key}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-[10rem] flex-1 font-mono text-sm"
        />
        <Button size="sm" onClick={save} disabled={draft === initial || mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
