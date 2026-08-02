import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "search_stores",
  title: "Search stores",
  description:
    "Search the RushOrder PH marketplace for live stores by name, optionally filtered by service type (food, groceries, pharmacy, services).",
  inputSchema: {
    query: z.string().trim().optional().describe("Text to match against the store name."),
    service_type: z
      .string()
      .trim()
      .optional()
      .describe("Service type filter, e.g. food, groceries, pharmacy or services."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of stores to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, service_type, limit }, ctx) => {
    if (!requireAuth(ctx)) return errorResult("Not authenticated.");
    const take = Math.min(Math.max(limit ?? 10, 1), 50);

    let request = supabaseForUser(ctx)
      .from("stores")
      .select(
        "id, name, description, service_type, rating, rating_count, is_online, minimum_order, prep_time_minutes",
      )
      .order("rating", { ascending: false })
      .limit(take);

    if (query) request = request.ilike("name", `%${query}%`);
    if (service_type) request = request.eq("service_type", service_type);

    const { data, error } = await request;
    if (error) return errorResult(error.message);
    return textResult({ stores: data ?? [] });
  },
});
