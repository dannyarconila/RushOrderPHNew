import { Link } from "@tanstack/react-router";
import { Zap } from "lucide-react";

import { cn } from "@/lib/utils";

export function Logo({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "invert";
}) {
  return (
    <Link to="/" className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="surface-ember flex size-9 items-center justify-center rounded-xl text-ink shadow-[var(--shadow-glow)]">
        <Zap className="size-5" strokeWidth={2.5} />
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            "font-display text-base font-extrabold tracking-tight",
            tone === "invert" ? "text-ink-foreground" : "text-foreground",
          )}
        >
          RushOrder
        </span>
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.28em] text-primary">
          PH
        </span>
      </span>
    </Link>
  );
}
