import { supabase } from "@/integrations/supabase/client";

export type CustomerServiceSettings = {
  email: string;
  phone: string;
  hours: string;
  enabled: boolean;
};

const DEFAULT_CUSTOMER_SERVICE: CustomerServiceSettings = {
  email: "support@rushorderph.online",
  phone: "",
  hours: "8:00 AM - 10:00 PM daily",
  enabled: true,
};

export async function getCustomerServiceSettings(): Promise<CustomerServiceSettings> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("key,value")
    .in("key", [
      "customer_service_email",
      "customer_service_phone",
      "customer_service_hours",
      "customer_service_enabled",
    ]);

  if (error) {
    console.error("Failed to load customer service settings:", error);
    return DEFAULT_CUSTOMER_SERVICE;
  }

  const settings = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));

  const stringValue = (key: string, fallback: string) => {
    const value = settings[key];

    return typeof value === "string" ? value : fallback;
  };

  const booleanValue = (key: string, fallback: boolean) => {
    const value = settings[key];

    return typeof value === "boolean" ? value : fallback;
  };

  return {
    email: stringValue("customer_service_email", DEFAULT_CUSTOMER_SERVICE.email),
    phone: stringValue("customer_service_phone", DEFAULT_CUSTOMER_SERVICE.phone),
    hours: stringValue("customer_service_hours", DEFAULT_CUSTOMER_SERVICE.hours),
    enabled: booleanValue("customer_service_enabled", DEFAULT_CUSTOMER_SERVICE.enabled),
  };
}
