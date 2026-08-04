import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { upsertSetting } from "@/lib/admin/mutations";
import { settingsQuery, type SettingRow } from "@/lib/admin/queries";

export const Route = createFileRoute("/internal-admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { data: settings, isLoading } = useQuery(settingsQuery());
  const byKey = new Map((settings ?? []).map((setting) => [setting.key, setting]));

  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Commission rates, delivery fees and operational toggles used across the marketplace."
      />

      <div className="grid gap-4 mb-6 md:grid-cols-4">
        <SettingCard
          setting={{
            key: "minimum_seller_wallet_balance",
            value: 1,
            description: "Minimum wallet balance required before a seller can receive orders.",
            is_public: false,
          }}
        />

        <SettingCard
          setting={{
            key: "minimum_rider_wallet_balance",
            value: 1,
            description: "Minimum wallet balance required before a rider can go online.",
            is_public: false,
          }}
        />

        <SettingCard
          setting={{
            key: "welcome_wallet_bonus",
            value: 50,
            description:
              "Free wallet balance automatically given to newly approved sellers and riders.",
            is_public: false,
          }}
        />

        <SettingCard
          setting={{
            key: "marketplace_customer_radius_km",
            value: byKey.get("marketplace_customer_radius_km")?.value ?? 15,
            description:
              "Maximum distance in kilometers for showing stores in customer marketplace results.",
            is_public: true,
          }}
        />
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading settings…</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(settings ?? [])
            .filter(
              (setting) =>
                ![
                  "minimum_seller_wallet_balance",
                  "minimum_rider_wallet_balance",
                  "welcome_wallet_bonus",
                  "marketplace_customer_radius_km",
                ].includes(setting.key),
            )
            .map((setting) => (
              <SettingCard key={setting.key} setting={setting} />
            ))}
        </div>
      )}
    </>
  );
}

function SettingCard({
  setting,
}: {
  setting: Pick<SettingRow, "key" | "value" | "description" | "is_public">;
}) {
  const queryClient = useQueryClient();
  const initial = JSON.stringify(setting.value);
  const [draft, setDraft] = useState(initial);

  useEffect(() => setDraft(initial), [initial]);

  const mutation = useMutation({
    mutationFn: upsertSetting,
    onSuccess: () => {
      toast.success(`${setting.key} updated`);
      void queryClient.invalidateQueries({ queryKey: ["admin", "settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function save() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error('Enter a valid JSON value (e.g. 12, true or "text").');
      return;
    }
    mutation.mutate({ key: setting.key, value: parsed });
  }

  return (
    <Panel title={setting.key} description={setting.description ?? undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-[12rem] flex-1 font-mono text-sm"
        />
        <Button size="sm" onClick={save} disabled={draft === initial || mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {setting.is_public ? "Visible to the app" : "Internal only"}
      </p>
    </Panel>
  );
}
