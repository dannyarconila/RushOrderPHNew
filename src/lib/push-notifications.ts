import { supabase } from "@/integrations/supabase/client";

const SERVICE_WORKER_PATH = "/sw.js";

function base64UrlToUint8Array(base64Url: string) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);

  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export async function registerPushServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (typeof window === "undefined") {
    throw new Error("Service workers are only available in the browser.");
  }

  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  return navigator.serviceWorker.register(SERVICE_WORKER_PATH);
}

export async function getPushPermission() {
  if (typeof window === "undefined") return "denied" as NotificationPermission;

  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  return Notification.permission;
}

export async function requestPushPermission() {
  if (typeof window === "undefined") {
    return "denied" as NotificationPermission;
  }

  if (!("Notification" in window)) {
    throw new Error("This browser does not support notifications.");
  }

  return Notification.requestPermission();
}

export async function savePushSubscription(userId: string, vapidPublicKey: string) {
  if (typeof window === "undefined") return null;

  const registration = await registerPushServiceWorker();

  const existingSubscription = await registration.pushManager.getSubscription();

  const subscription =
    existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();

  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("Browser returned an incomplete push subscription.");
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      updated_at: new Date().toISOString(),
    },
    {
      onConflict: "endpoint",
    },
  );

  if (error) throw error;

  return subscription;
}

export async function removeCurrentPushSubscription(userId: string) {
  if (typeof window === "undefined") return;

  if (!("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH);

  if (!registration) return;

  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) return;

  const endpoint = subscription.endpoint;

  await subscription.unsubscribe();

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) throw error;
}
