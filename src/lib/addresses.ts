import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AddressRow = Database["public"]["Tables"]["addresses"]["Row"];

export function myAddressesQuery(userId: string | undefined) {
  return queryOptions({
    queryKey: ["my-addresses", userId ?? null],
    enabled: Boolean(userId),
    queryFn: async (): Promise<AddressRow[]> => {
      const { data, error } = await supabase
        .from("addresses")
        .select("*")
        .eq("user_id", userId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export interface AddressInput {
  label: string;
  recipient_name: string;
  phone: string;
  line1: string;
  barangay: string;
  city: string;
  province: string;
  postal_code: string;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

export const EMPTY_ADDRESS: AddressInput = {
  label: "Home",
  recipient_name: "",
  phone: "",
  line1: "",
  barangay: "",
  city: "",
  province: "",
  postal_code: "",
  latitude: null,
  longitude: null,
  is_default: true,
};

export async function createAddress(userId: string, input: AddressInput): Promise<AddressRow> {
  if (input.is_default) {
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
  }
  const { data, error } = await supabase
    .from("addresses")
    .insert({ ...input, user_id: userId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateAddressLocation(
  userId: string,
  addressId: string,
  latitude: number,
  longitude: number,
): Promise<AddressRow> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("A valid map location is required.");
  }

  const { data, error } = await supabase
    .from("addresses")
    .update({ latitude, longitude })
    .eq("id", addressId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAddress(
  userId: string,
  addressId: string,
): Promise<void> {
  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", addressId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteAllAddresses(userId: string): Promise<void> {
  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}

export function formatAddress(address: AddressRow): string {
  return [address.line1, address.barangay, address.city, address.province, address.postal_code]
    .filter(Boolean)
    .join(", ");
}
