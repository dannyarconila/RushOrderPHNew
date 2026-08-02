import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getOrderTool from "./tools/get-order";
import listMyOrdersTool from "./tools/list-my-orders";
import listNotificationsTool from "./tools/list-notifications";
import listStoreProductsTool from "./tools/list-store-products";
import searchStoresTool from "./tools/search-stores";

// The OAuth issuer must be the direct Supabase host; the project ref is the
// only value that survives publish unchanged.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "rushorder-ph-hub",
  title: "RushOrder PH Hub",
  version: "0.1.0",
  instructions:
    "Tools for RushOrder PH, a Philippine marketplace and delivery platform. Use search_stores and list_store_products to explore the marketplace, list_my_orders and get_order to track the signed-in user's orders and deliveries, and list_notifications for their platform updates. All tools act as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    searchStoresTool,
    listStoreProductsTool,
    listMyOrdersTool,
    getOrderTool,
    listNotificationsTool,
  ],
});
