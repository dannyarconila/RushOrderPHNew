import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CircleHelp, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Logo } from "@/components/brand/logo";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export function DashboardLayout({
  workspace,
  items,
  children,
  identity,
  onSignOut,
}: {
  workspace: string;
  items: NavItem[];
  children: ReactNode;
  /** Label shown in the sidebar footer. Defaults to the Supabase Auth email. */
  identity?: string;
  /** Overrides the default Supabase sign-out (used by the internal portal). */
  onSignOut?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    if (onSignOut) {
      await onSignOut();
      return;
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const supportItem: NavItem = {
    to: "/contact",
    label: "Help & Support",
    icon: CircleHelp,
  };

  const nav = (
    <>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = pathname === item.to;

          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-2 border-t border-sidebar-border pt-2">
        <Link
          to="/contact"
          onClick={() => setOpen(false)}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors",
            pathname === "/contact"
              ? "bg-primary text-primary-foreground shadow-[var(--shadow-glow)]"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <CircleHelp className="size-4 shrink-0" />
          Help & Support
        </Link>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-5 lg:flex">
        <Logo tone="invert" />
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-sidebar-foreground/50">
          {workspace}
        </p>
        {nav}
        <div className="space-y-3 border-t border-sidebar-border pt-4">
          <p className="truncate text-xs text-sidebar-foreground/60">{identity ?? user?.email}</p>
          <Button
            variant="ghost"
            size="sm"
            block
            onClick={handleSignOut}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Toggle navigation"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex size-10 items-center justify-center rounded-xl border border-border lg:hidden"
            >
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <span className="font-display text-sm font-bold tracking-tight lg:hidden">
              RushOrder PH
            </span>
            <span className="hidden text-sm font-semibold text-muted-foreground lg:inline">
              {workspace}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationCenter />
            <Button asChild variant="ghost" size="sm">
              <Link to="/">Back to site</Link>
            </Button>
          </div>
        </header>

        {open ? (
          <div className="border-b border-sidebar-border bg-sidebar p-4 lg:hidden">
            {nav}
            <Button
              variant="ghost"
              size="sm"
              block
              onClick={handleSignOut}
              className="mt-3 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
