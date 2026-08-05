import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

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
  component: PasugoChatRedirect,
});

function PasugoChatRedirect() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/booking-chat/$orderId", params: { orderId: bookingId }, replace: true });
  }, [bookingId, navigate]);

  return null;
}
