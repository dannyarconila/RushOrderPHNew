import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT")!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PushRequest = {
  user_id?: string;
  title?: string;
  body?: string;
  action_url?: string;
  tag?: string;
};

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
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

Deno.serve(async (req) => {
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

    const user = await getAuthenticatedUser(req);

    if (!user) {
      return Response.json(
        { error: "Authentication required." },
        {
          status: 401,
          headers: corsHeaders,
        },
      );
    }

    const body = (await req.json()) as PushRequest;

    const targetUserId = body.user_id || user.id;
    const admin = await isAdmin(user.id);

    if (targetUserId !== user.id && !admin) {
      return Response.json(
        { error: "You can only send push notifications to your own account." },
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

    const { data: subscriptions, error: subscriptionError } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", targetUserId);

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!subscriptions?.length) {
      return Response.json(
        {
          sent: 0,
          removed: 0,
          message: "No push subscriptions found for this user.",
        },
        {
          status: 200,
          headers: corsHeaders,
        },
      );
    }

    const payload = JSON.stringify({
      title,
      body: notificationBody,
      action_url: actionUrl,
      tag,
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

        const message = error instanceof Error ? error.message : String(error);

        errors.push(message);
      }
    }

    return Response.json(
      {
        sent,
        removed,
        failed: errors.length,
        errors,
      },
      {
        status: 200,
        headers: corsHeaders,
      },
    );
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
