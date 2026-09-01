import { queryOptions } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

export async function getPasugoChatUnread(bookingId: string, userId: string): Promise<boolean> {
  const { data: readState, error: readError } = await supabase
    .from("pasugo_chat_reads" as never)
    .select("last_read_at")
    .eq("booking_id", bookingId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw readError;

  let query = supabase
    .from("pasugo_chat_messages")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("recipient_id", userId)
    .limit(1);

  const lastReadAt = (readState as { last_read_at?: string } | null)?.last_read_at;
  if (lastReadAt) query = query.gt("created_at", lastReadAt);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).length > 0;
}

export function pasugoChatUnreadQuery(bookingId: string | undefined, userId: string | undefined) {
  return queryOptions({
    queryKey: ["pasugo-chat-unread", bookingId ?? null, userId ?? null],
    enabled: Boolean(bookingId && userId),
    queryFn: () => (bookingId && userId ? getPasugoChatUnread(bookingId, userId) : false),
  });
}

export async function markPasugoChatRead(bookingId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("pasugo_chat_reads" as never)
    .upsert(
      { booking_id: bookingId, user_id: userId, last_read_at: now, updated_at: now } as never,
      { onConflict: "booking_id,user_id" },
    );
  if (error) throw error;
}
