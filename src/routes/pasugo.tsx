import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/pasugo")({
  component: PasugoLayout,
});

function PasugoLayout() {
  return <Outlet />;
}
