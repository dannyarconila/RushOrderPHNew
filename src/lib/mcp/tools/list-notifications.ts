import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_notifications",
  title: "List my notifications",
  description: "List the signed-in user's RushOrder PH notifications, newest first.",
  inputSchema: {
    unread_only: z.boolean().optional().describe("When true, return only unread notifications."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of notifications to return (default 20, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ unread_only, limit }, ctx) => {
    if (!requireAuth(ctx)) return errorResult("Not authenticated.");
    const take = Math.min(Math.max(limit ?? 20, 1), 50);

    let request = supabaseForUser(ctx)
      .from("notifications")
      .select("id, title, body, kind, is_read, created_at")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(take);

    if (unread_only) request = request.eq("is_read", false);

    const { data, error } = await request;
    if (error) return errorResult(error.message);
    return textResult({ notifications: data ?? [] });
  },
});
