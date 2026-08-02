import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { errorResult, requireAuth, supabaseForUser, textResult } from "../supabase";

export default defineTool({
  name: "get_order",
  title: "Get order details",
  description:
    "Fetch one RushOrder PH order the signed-in user can access, including its line items and delivery status.",
  inputSchema: {
    order_id: z.string().trim().describe("The order UUID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ order_id }, ctx) => {
    if (!requireAuth(ctx)) return errorResult("Not authenticated.");
    const supabase = supabaseForUser(ctx);

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, status, total, subtotal, delivery_fee, tax, surge_fee, notes, payment_method, payment_status, claim_number, created_at, updated_at, store_id",
      )
      .eq("id", order_id)
      .maybeSingle();

    if (error) return errorResult(error.message);
    if (!order) return errorResult("Order not found or not visible to this account.");

    const [{ data: items }, { data: delivery }] = await Promise.all([
      supabase
        .from("order_items")
        .select("product_name, unit_price, quantity")
        .eq("order_id", order_id),
      supabase
        .from("deliveries")
        .select("status, fee, distance_km, accepted_at, delivered_at")
        .eq("order_id", order_id)
        .maybeSingle(),
    ]);

    return textResult({ order, items: items ?? [], delivery: delivery ?? null });
  },
});
