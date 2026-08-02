import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "list_my_orders",
  title: "List my orders",
  description:
    "List the signed-in user's RushOrder PH orders, newest first, with status, totals and payment state.",
  inputSchema: {
    status: z
      .string()
      .trim()
      .optional()
      .describe(
        "Optional status filter: pending, confirmed, preparing, ready, picked_up, delivered or cancelled.",
      ),
    limit: z
      .number()
      .int()
      .optional()
      .describe("Maximum number of orders to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!requireAuth(ctx)) return errorResult("Not authenticated.");
    const take = Math.min(Math.max(limit ?? 10, 1), 50);

    let request = supabaseForUser(ctx)
      .from("orders")
      .select(
        "id, status, total, subtotal, delivery_fee, payment_method, payment_status, claim_number, created_at, store_id",
      )
      .eq("customer_id", ctx.getUserId()!)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(take);

    if (status) request = request.eq("status", status as never);

    const { data, error } = await request;
    if (error) return errorResult(error.message);
    return textResult({ orders: data ?? [] });
  },
});
