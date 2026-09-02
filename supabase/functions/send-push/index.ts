import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;
const PUSH_WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationRecord = {
  id?: string;
  user_id: string;
  title: string;
  body?: string | null;
  kind?: string | null;
  pasugo_booking_id?: string | null;
  dispatch_offer_id?: string | null;
  dispatch_offer_type?: string | null;
};

type WebhookPayload = {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: NotificationRecord | null;
  old_record: NotificationRecord | null;
};

type PushRequest = {
  user_id?: string;
  title?: string;
  body?: string;
  action_url?: string;
  tag?: string;
};

function hasValidWebhookSecret(req: Request) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  return Boolean(PUSH_WEBHOOK_SECRET && token && token === PUSH_WEBHOOK_SECRET);
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return null;
  }

  // Do not try to authenticate the webhook secret as a Supabase JWT.
  if (PUSH_WEBHOOK_SECRET && token === PUSH_WEBHOOK_SECRET) {
    return null;
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function isAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function sendPushToUser(
  targetUserId: string,
  title: string,
  notificationBody: string,
  actionUrl: string,
  tag: string,
) {
  const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", targetUserId);

  if (subscriptionError) {
    throw subscriptionError;
  }

  if (!subscriptions?.length) {
    return {
      sent: 0,
      removed: 0,
      failed: 0,
      errors: [] as string[],
    };
  }

  const { count: unreadCount, error: unreadError } = await supabaseAdmin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", targetUserId)
    .eq("is_read", false);

  if (unreadError) {
    throw unreadError;
  }

  const payload = JSON.stringify({
    title,
    body: notificationBody,
    action_url: actionUrl,
    tag,
    unreadCount: unreadCount ?? 0,
  });

  let sent = 0;
  let removed = 0;
  const errors: string[] = [];

  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        payload,
      );

      sent += 1;
    } catch (error) {
      const statusCode =
        typeof error === "object" &&
        error !== null &&
        "statusCode" in error &&
        typeof error.statusCode === "number"
          ? error.statusCode
          : null;

      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("id", subscription.id);

        if (deleteError) {
          errors.push(
            `Failed to remove expired subscription ${subscription.id}: ${deleteError.message}`,
          );
        } else {
          removed += 1;
        }

        continue;
      }

      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    sent,
    removed,
    failed: errors.length,
    errors,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed." },
        {
          status: 405,
          headers: corsHeaders,
        },
      );
    }

    const webhookAuthenticated = hasValidWebhookSecret(req);

    const user = webhookAuthenticated ? null : await getAuthenticatedUser(req);

    if (!user && !webhookAuthenticated) {
      return Response.json(
        { error: "Authentication required." },
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    const incoming = await req.json();

    // Database Webhook payload.
    if (webhookAuthenticated) {
      const payload = incoming as WebhookPayload;

      if (
        payload.type !== "INSERT" ||
        payload.schema !== "public" ||
        payload.table !== "notifications" ||
        !payload.record
      ) {
        return Response.json(
          {
            sent: 0,
            message: "Ignored non-notification webhook event.",
          },
          {
            status: 200,
            headers: corsHeaders,
          },
        );
      }

      const notification = payload.record;

      const notificationKind = notification.kind || "notification";

      const actionUrl =
        notification.pasugo_booking_id
          ? `/pasugo/${encodeURIComponent(notification.pasugo_booking_id)}`
          : notificationKind === "new_order" || notificationKind === "order"
            ? "/store-orders"
            : notificationKind === "dispatch"
              ? notification.dispatch_offer_id
                ? `/rider?incomingBooking=${encodeURIComponent(notification.dispatch_offer_id)}`
                : "/rider"
              : "/";

      const result = await sendPushToUser(
        notification.user_id,
        notification.title || "RushOrder PH",
        notification.body || "You have a new notification.",
        actionUrl,
        notificationKind,
      );

      return Response.json(
        {
          ...result,
          source: "database_webhook",
          notification_id: notification.id ?? null,
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    // Normal authenticated manual/admin request.
    const body = incoming as PushRequest;

    const targetUserId = body.user_id || user!.id;
    const admin = await isAdmin(user!.id);

    if (targetUserId !== user!.id && !admin) {
      return Response.json(
        {
          error: "You can only send push notifications to your own account.",
        },
        {
          status: 403,
          headers: corsHeaders,
        },
      );
    }

    const title = body.title?.trim() || "RushOrder PH";
    const notificationBody = body.body?.trim() || "You have a new notification.";
    const actionUrl = body.action_url?.trim() || "/";
    const tag = body.tag?.trim() || "rushorder-notification";

    const result = await sendPushToUser(targetUserId, title, notificationBody, actionUrl, tag);

    return Response.json(result, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error("send-push error:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown error.",
      },
      {
        status: 500,
        headers: corsHeaders,
      },
    );
  }
});
