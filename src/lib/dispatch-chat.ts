import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DispatchChatMessage {
  id: string;
  order_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
}

export async function getDispatchChatUnread(
  orderId: string,
  userId: string,
): Promise<boolean> {
  const { data: readState, error: readError } = await supabase
    .from("dispatch_chat_reads" as never)
    .select("last_read_at")
    .eq("order_id", orderId)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw readError;

  let query = supabase
    .from("dispatch_chat_messages" as never)
    .select("id")
    .eq("order_id", orderId)
    .eq("recipient_id", userId)
    .limit(1);

  const lastReadAt =
    (readState as { last_read_at?: string } | null)?.last_read_at;

  if (lastReadAt) {
    query = query.gt("created_at", lastReadAt);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).length > 0;
}


export function dispatchChatUnreadQuery(
  orderId: string | undefined,
  userId: string | undefined,
) {
  return queryOptions({
    queryKey: ["dispatch-chat-unread", orderId ?? null, userId ?? null],
    enabled: Boolean(orderId && userId),
    queryFn: async (): Promise<boolean> => {
      if (!orderId || !userId) return false;
      return getDispatchChatUnread(orderId, userId);
    },
  });
}

export async function markDispatchChatRead(
  orderId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("dispatch_chat_reads" as never)
    .upsert(
      {
        order_id: orderId,
        user_id: userId,
        last_read_at: now,
        updated_at: now,
      } as never,
      {
        onConflict: "order_id,user_id",
      },
    );

  if (error) throw error;
}
