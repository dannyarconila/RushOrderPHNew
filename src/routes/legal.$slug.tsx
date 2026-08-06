import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/legal/$slug")({
  component: () => (
    <div
      style={{
        background: "red",
        color: "white",
        minHeight: "100vh",
        padding: "40px",
        fontSize: "32px",
      }}
    >
      LEGAL SLUG ROUTE WORKS
    </div>
  ),
});