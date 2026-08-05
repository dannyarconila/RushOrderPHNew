import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ImageUpload } from "@/components/forms/image-upload";
import { Field, SelectField, TextAreaField, TextField } from "@/components/forms/wizard";
import { Panel } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { peso } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import { BUCKETS } from "@/lib/storage";
import { storeAvailability } from "@/lib/store-status";
import { minimumWalletBalanceQuery, myWalletQuery } from "@/lib/wallet";
import {
  DEFAULT_HOURS,
  SERVICE_TYPES,
  WEEKDAYS,
  parseBusinessHours,
  type BusinessHours,
  type ManagedStore,
} from "@/lib/stores";

interface AddressShape {
  line1: string;
  barangay: string;
  city: string;
  province: string;
  postal_code: string;
}

function parseAddress(value: unknown): AddressShape {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const str = (key: string) => (typeof raw[key] === "string" ? (raw[key] as string) : "");
  const line1 = str("line1") || str("street") || str("address") || str("building");
  return {
    line1,
    barangay: str("barangay"),
    city: str("city"),
    province: str("province"),
    postal_code: str("postal_code"),
  };
}

const SERVICE_LABELS = SERVICE_TYPES.map((s) => s.label);

/** Full store profile editor: branding, address, coordinates, hours and delivery rules. */
export function StoreEditor({ store, userId }: { store: ManagedStore; userId: string }) {
  const queryClient = useQueryClient();

  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? "");
  const [phone, setPhone] = useState(store.phone ?? "");
  const [serviceType, setServiceType] = useState(store.service_type);
  const [logo, setLogo] = useState<string | null>(store.logo_url);
  const [banner, setBanner] = useState<string | null>(store.banner_url);
  const [cover, setCover] = useState<string | null>(store.cover_url);
  const [address, setAddress] = useState<AddressShape>(() => parseAddress(store.address));
  const [latitude, setLatitude] = useState(store.latitude != null ? String(store.latitude) : "");
  const [longitude, setLongitude] = useState(
    store.longitude != null ? String(store.longitude) : "",
  );
  const [hours, setHours] = useState<BusinessHours>(() => parseBusinessHours(store.business_hours));
  const [radius, setRadius] = useState(String(store.delivery_radius_km ?? 8));
  const [minOrder, setMinOrder] = useState(String(store.minimum_order ?? 0));
  const [feeOverride, setFeeOverride] = useState(
    store.delivery_fee_override != null ? String(store.delivery_fee_override) : "",
  );
  const [prepTime, setPrepTime] = useState(String(store.prep_time_minutes ?? 20));
  const { data: wallet } = useQuery(myWalletQuery(userId, "seller"));
  const { data: minimumBalance } = useQuery(minimumWalletBalanceQuery("seller"));

  const isVerified = store.verification_status === "verified";
  const availability = storeAvailability(store);
  const walletBalanceLow = minimumBalance != null && (wallet?.balance ?? 0) < minimumBalance;
  const storeForcedOffline = Boolean(store.wallet_hold) && !store.is_online;
  const showWalletMinimumNotice = storeForcedOffline || walletBalanceLow;

  const save = useMutation({
    mutationFn: async () => {
      const num = (value: string, fallback: number) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
      };
      const optionalNum = (value: string) => {
        if (value.trim() === "") return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };

      const { error } = await supabase
        .from("stores")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          phone: phone.trim() || null,
          service_type: serviceType,
          logo_url: logo,
          banner_url: banner,
          cover_url: cover,
          address: address as unknown as never,
          latitude: optionalNum(latitude),
          longitude: optionalNum(longitude),
          business_hours: hours as unknown as never,
          delivery_radius_km: num(radius, 8),
          minimum_order: num(minOrder, 0),
          delivery_fee_override: optionalNum(feeOverride),
          prep_time_minutes: Math.round(num(prepTime, 20)),
        })
        .eq("id", store.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Store profile saved");
      void queryClient.invalidateQueries({ queryKey: ["my-stores"] });
      void queryClient.invalidateQueries({ queryKey: ["stores"] });
    },
    onError: (error: Error) => toast.error("Could not save store", { description: error.message }),
  });

  const toggleOnline = useMutation({
    mutationFn: async (next: boolean) => {
      const { error } = await supabase.rpc("store_set_online", {
        _store_id: store.id,
        _online: next,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["my-stores"] }),
    onError: (error: Error) =>
      toast.error("Could not update status", { description: error.message }),
  });

  function setDay(
    key: (typeof WEEKDAYS)[number]["key"],
    patch: Partial<BusinessHours[typeof key]>,
  ) {
    setHours((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Store status"
        description={
          isVerified
            ? "Your store is live in the marketplace. Customers can always browse; ordering follows your opening hours."
            : "Your store goes live in the marketplace once an admin verifies it."
        }
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">
              {isVerified ? availability.label : "Not live yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isVerified
                ? (availability.detail ??
                  "Set your weekly opening hours below to control when orders are accepted.")
                : "Verification pending — your storefront is hidden until it is approved."}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Switch
              checked={store.is_online}
              disabled={
                !isVerified ||
                toggleOnline.isPending ||
                ((walletBalanceLow || storeForcedOffline) && !store.is_online)
              }
              onCheckedChange={(next) => toggleOnline.mutate(next)}
              aria-label="Accepting orders"
            />
            {showWalletMinimumNotice ? (
              <p className="text-right text-xs text-destructive">
                {minimumBalance != null
                  ? `Your wallet balance must be at least ${peso(minimumBalance)} to keep the store open.`
                  : "Your wallet balance is too low to keep the store open."}
              </p>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Store profile" description="Branding customers see in the marketplace">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Store name" value={name} onChange={setName} />
          <TextField
            label="Contact number"
            value={phone}
            onChange={setPhone}
            placeholder="09XX XXX XXXX"
          />
        </div>
        <div className="mt-4">
          <TextAreaField
            label="Store description"
            value={description}
            onChange={setDescription}
            placeholder="Tell customers what makes your store special."
          />
        </div>
        <div className="mt-4">
          <SelectField
            label="Service lane"
            value={SERVICE_TYPES.find((s) => s.value === serviceType)?.label ?? ""}
            onChange={(label) => {
              const match = SERVICE_TYPES.find((s) => s.label === label);
              if (match) setServiceType(match.value);
            }}
            options={SERVICE_LABELS}
          />
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <ImageUpload
            label="Store logo"
            bucket={BUCKETS.storeLogos}
            userId={userId}
            folder={store.id}
            value={logo}
            onChange={setLogo}
          />
          <ImageUpload
            label="Banner"
            bucket={BUCKETS.storeBanners}
            userId={userId}
            folder={store.id}
            value={banner}
            onChange={setBanner}
            aspect="wide"
          />
          <ImageUpload
            label="Cover photo"
            bucket={BUCKETS.storeBanners}
            userId={userId}
            folder={`${store.id}/cover`}
            value={cover}
            onChange={setCover}
            aspect="wide"
          />
        </div>
      </Panel>

      <Panel
        title="Address & coordinates"
        description="Used for delivery distance and rider pickup"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Street address"
            value={address.line1}
            onChange={(v) => setAddress((a) => ({ ...a, line1: v }))}
          />
          <TextField
            label="Barangay"
            value={address.barangay}
            onChange={(v) => setAddress((a) => ({ ...a, barangay: v }))}
          />
          <TextField
            label="City / municipality"
            value={address.city}
            onChange={(v) => setAddress((a) => ({ ...a, city: v }))}
          />
          <TextField
            label="Province"
            value={address.province}
            onChange={(v) => setAddress((a) => ({ ...a, province: v }))}
          />
          <TextField
            label="Postal code"
            value={address.postal_code}
            onChange={(v) => setAddress((a) => ({ ...a, postal_code: v }))}
          />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Latitude"
            value={latitude}
            onChange={setLatitude}
            placeholder="14.5995"
            hint="Optional — improves rider matching accuracy."
          />
          <TextField
            label="Longitude"
            value={longitude}
            onChange={setLongitude}
            placeholder="120.9842"
          />
        </div>
      </Panel>

      <Panel title="Business hours" description="Your weekly operating schedule">
        <div className="flex flex-col gap-2">
          {WEEKDAYS.map((day) => {
            const value = hours[day.key];
            return (
              <div
                key={day.key}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5"
              >
                <span className="w-24 text-sm font-semibold">{day.label}</span>
                <Switch
                  checked={!value.closed}
                  onCheckedChange={(open) => setDay(day.key, { closed: !open })}
                  aria-label={`${day.label} open`}
                />
                {value.closed ? (
                  <span className="text-xs text-muted-foreground">Closed</span>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={value.open}
                      onChange={(e) => setDay(day.key, { open: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
                      aria-label={`${day.label} opening time`}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="time"
                      value={value.close}
                      onChange={(e) => setDay(day.key, { close: e.target.value })}
                      className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
                      aria-label={`${day.label} closing time`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setHours(DEFAULT_HOURS)}
          className="mt-3 text-xs font-semibold text-primary hover:underline"
        >
          Reset to 8:00 AM – 8:00 PM daily
        </button>
      </Panel>

      <Panel title="Delivery rules" description="How far you deliver and what customers must spend">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Delivery radius (km)"
            value={radius}
            onChange={setRadius}
            type="number"
          />
          <TextField
            label="Minimum order (₱)"
            value={minOrder}
            onChange={setMinOrder}
            type="number"
          />
          <TextField
            label="Store delivery fee (₱)"
            value={feeOverride}
            onChange={setFeeOverride}
            type="number"
            hint="Leave blank to use the platform delivery fee engine."
          />
          <TextField
            label="Preparation time (minutes)"
            value={prepTime}
            onChange={setPrepTime}
            type="number"
          />
        </div>
      </Panel>

      {store.verification_notes ? (
        <Panel title="Reviewer notes">
          <p className="text-sm text-muted-foreground">{store.verification_notes}</p>
        </Panel>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save store profile
        </Button>
      </div>
    </div>
  );
}

export { Field as StoreField };
