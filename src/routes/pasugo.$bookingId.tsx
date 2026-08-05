import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/pasugo/$bookingId")({
  head: () => ({
    meta: [
      { title: "Finding rider — Pasugo | RushOrder PH" },
      {
        name: "description",
        content: "Track your standalone Pasugo rider booking in real time.",
      },
    ],
  }),
  component: PasugoTrackingRedirect,
});

function PasugoTrackingRedirect() {
  const { bookingId } = Route.useParams();
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/order/$orderId", params: { orderId: bookingId }, replace: true });
  }, [bookingId, navigate]);

  return null;
}
