import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";

interface ChatMessageRow {
  id: string;
  order_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
}

interface OrderChatMeta {
  id: string;
  claim_number: string | null;
  customer_id: string;
  rider_id: string | null;
}

export const Route = createFileRoute("/booking-chat/$orderId")({
  head: () => ({
    meta: [
      { title: "Booking chat — RushOrder PH" },
      {
        name: "description",
        content:
          "In-app chat between customer and rider while a RushOrder PH booking is in progress.",
      },
    ],
  }),
  component: BookingChatPage,
});

function BookingChatPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { next: `/booking-chat/${orderId}` }, replace: true });
    }
  }, [loading, user, navigate, orderId]);

  const order = useQuery({
    queryKey: ["booking-chat", "order", orderId],
    queryFn: async (): Promise<OrderChatMeta | null> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,claim_number,customer_id,rider_id")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OrderChatMeta | null;
    },
  });

  const messages = useQuery({
    queryKey: ["booking-chat", orderId],
    enabled: Boolean(user),
    queryFn: async (): Promise<ChatMessageRow[]> => {
      const { data, error } = await supabase
        .from("dispatch_chat_messages" as never)
        .select("id,order_id,sender_id,recipient_id,message,created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as ChatMessageRow[]).map((row) => ({
        ...row,
        message: row.message ?? "",
      }));
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`booking-chat-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_chat_messages", filter: `order_id=eq.${orderId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["booking-chat", orderId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, queryClient]);

  const recipientId = useMemo(() => {
    if (!user || !order.data) return null;
    if (!order.data.rider_id) return null;
    return user.id === order.data.customer_id ? order.data.rider_id : order.data.customer_id;
  }, [user, order.data]);

  const send = useMutation({
    mutationFn: async () => {
      const message = draft.trim();
      if (!message) throw new Error("Type a message.");
      if (!user) throw new Error("Sign in required.");
      if (!recipientId) throw new Error("Chat becomes available once a rider is assigned.");

      const { error } = await supabase.from("dispatch_chat_messages" as never).insert({
        order_id: orderId,
        sender_id: user.id,
        recipient_id: recipientId,
        message,
      } as never);
      if (error) throw error;
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["booking-chat", orderId] });
    },
    onError: (error: Error) => toast.error("Could not send", { description: error.message }),
  });

  const claim = order.data?.claim_number ?? orderId.slice(0, 8).toUpperCase();

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Booking chat
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Order {claim}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Chat directly with your rider or customer inside RushOrder PH.
        </p>

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:p-6">
          {!order.data?.rider_id ? (
            <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning-foreground">
              Chat opens once a rider accepts this booking.
            </p>
          ) : null}

          <div className="mt-4 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
            {(messages.data ?? []).length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                <MessageCircle className="mx-auto mb-2 size-5" />
                No messages yet. Start the conversation below.
              </div>
            ) : (
              (messages.data ?? []).map((msg) => {
                const mine = msg.sender_id === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-muted text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                    <p
                      className={`mt-1 text-[11px] ${
                        mine ? "text-primary-foreground/80" : "text-muted-foreground"
                      }`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your message"
              maxLength={1000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!send.isPending) void send.mutateAsync();
                }
              }}
              disabled={send.isPending || !order.data?.rider_id}
            />
            <Button
              onClick={() => void send.mutateAsync()}
              disabled={send.isPending || !draft.trim() || !order.data?.rider_id}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </section>

        <div className="mt-4 flex gap-3">
          <Button asChild variant="outline">
            <Link to="/order/$orderId" params={{ orderId }}>
              Back to tracking
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/rider">Rider dashboard</Link>
          </Button>
        </div>
      </main>
    </PublicLayout>
  );
}
