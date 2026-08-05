import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";

import { CartSheet } from "@/components/cart/cart-sheet";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { getDashboardRoute } from "@/lib/dashboard-route";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/food", label: "Food" },
  { to: "/groceries", label: "Groceries" },
  { to: "/pharmacy", label: "Pharmacy" },
  { to: "/services", label: "Services" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const { user, primaryRole, loading, hasRole } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                pathname === item.to
                  ? "bg-primary-soft text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <CartSheet />
          {hasRole("seller") ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/seller">My Store</Link>
            </Button>
          ) : null}
          {hasRole("rider") ? (
            <Button asChild variant="ghost" size="sm">
              <Link to="/rider">My Rider</Link>
            </Button>
          ) : null}
          {loading ? null : user ? (
            <Button asChild size="sm">
              <Link to={getDashboardRoute(primaryRole)}>My dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
                <Link to="/become-seller">Become a Seller</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Log in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">Register</Link>
              </Button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <CartSheet />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-xl border border-border text-foreground md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border bg-background md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-4">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className="rounded-xl px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 border-t border-border pt-2">
              {[
                hasRole("seller")
                  ? { to: "/seller", label: "My Store" }
                  : { to: "/become-seller", label: "Become a Seller" },
                hasRole("rider")
                  ? { to: "/rider", label: "My Rider" }
                  : { to: "/become-rider", label: "Become a Rider" },
              ].map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-sm font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
            </div>
            <div className="mt-2 flex flex-col gap-2">
              {user ? (
                <Button asChild block onClick={() => setOpen(false)}>
                  <Link to={getDashboardRoute(primaryRole)}>My dashboard</Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" block onClick={() => setOpen(false)}>
                    <Link to="/login">Log in</Link>
                  </Button>
                  <Button asChild block onClick={() => setOpen(false)}>
                    <Link to="/register">Register</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
