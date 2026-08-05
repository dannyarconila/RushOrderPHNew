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
import { pasugoBookingQuery } from "@/lib/pasugo";

interface PasugoChatMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  recipient_id: string;
  message: string;
  created_at: string;
}

export const Route = createFileRoute("/pasugo-chat/$bookingId")({
  head: () => ({
    meta: [
      { title: "Pasugo booking chat — RushOrder PH" },
      {
        name: "description",
        content: "In-app conversation between customer and rider for standalone Pasugo bookings.",
      },
    ],
  }),
  component: PasugoChatPage,
});

function PasugoChatPage() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { next: `/pasugo-chat/${bookingId}` }, replace: true });
    }
  }, [loading, user, navigate, bookingId]);

  const booking = useQuery(pasugoBookingQuery(bookingId));

  const messages = useQuery({
    queryKey: ["pasugo-chat", bookingId],
    enabled: Boolean(user),
    queryFn: async (): Promise<PasugoChatMessage[]> => {
      const { data, error } = await supabase
        .from("pasugo_chat_messages" as never)
        .select("id,booking_id,sender_id,recipient_id,message,created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PasugoChatMessage[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`pasugo-chat-${bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "pasugo_chat_messages",
          filter: `booking_id=eq.${bookingId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["pasugo-chat", bookingId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [bookingId, queryClient]);

  const recipientId = useMemo(() => {
    if (!user || !booking.data?.assigned_rider_id) return null;
    return user.id === booking.data.customer_id
      ? booking.data.assigned_rider_id
      : booking.data.customer_id;
  }, [user, booking.data]);

  const send = useMutation({
    mutationFn: async () => {
      const message = draft.trim();
      if (!message) throw new Error("Type a message.");
      if (!user) throw new Error("Sign in required.");
      if (!recipientId) throw new Error("Chat becomes available once a rider is assigned.");

      const { error } = await supabase.from("pasugo_chat_messages" as never).insert({
        booking_id: bookingId,
        sender_id: user.id,
        recipient_id: recipientId,
        message,
      } as never);
      if (error) throw error;

      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["pasugo-chat", bookingId] });
    },
    onError: (error: Error) => toast.error("Could not send", { description: error.message }),
  });

  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Pasugo chat
        </p>
        <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Booking #{bookingId.slice(0, 8).toUpperCase()}
        </h1>

        <section className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] sm:p-6">
          {!booking.data?.assigned_rider_id ? (
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
              disabled={send.isPending || !booking.data?.assigned_rider_id}
            />
            <Button
              onClick={() => void send.mutateAsync()}
              disabled={send.isPending || !draft.trim() || !booking.data?.assigned_rider_id}
            >
              <Send className="size-4" />
            </Button>
          </div>
        </section>

        <div className="mt-4 flex gap-3">
          <Button asChild variant="outline">
            <Link to="/pasugo/$bookingId" params={{ bookingId }}>
              Back to booking
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
