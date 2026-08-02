import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_store_products",
  title: "List store products",
  description:
    "List the published products of one RushOrder PH store, including price, stock and availability.",
  inputSchema: {
    store_id: z.string().trim().describe("The store's UUID, as returned by search_stores."),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of products to return (default 25, max 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ store_id, limit }, ctx) => {
    if (!requireAuth(ctx)) return errorResult("Not authenticated.");
    const take = Math.min(Math.max(limit ?? 25, 1), 100);

    const { data, error } = await supabaseForUser(ctx)
      .from("products")
      .select("id, name, description, price, compare_at_price, stock, is_available")
      .eq("store_id", store_id)
      .eq("is_published", true)
      .is("deleted_at", null)
      .order("name")
      .limit(take);

    if (error) return errorResult(error.message);
    return textResult({ products: data ?? [] });
  },
});
