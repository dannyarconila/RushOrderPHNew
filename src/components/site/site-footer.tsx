import { Link } from "@tanstack/react-router";

import { Logo } from "@/components/brand/logo";

const COLUMNS = [
  {
    title: "Marketplace",
    links: [
      { to: "/", label: "Home" },
      { to: "/about", label: "About us" },
      { to: "/faq", label: "Help centre" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Partners",
    links: [
      { to: "/become-seller", label: "Become a selling partner" },
      { to: "/become-rider", label: "Become a rider" },
      { to: "/login", label: "Partner log in" },
      { to: "/register", label: "Create an account" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/legal", label: "Legal Center" },
      { to: "/legal/terms-conditions", label: "Terms & Conditions" },
      { to: "/legal/privacy-policy", label: "Privacy Policy" },
      { to: "/legal/trust-safety", label: "Trust & Safety" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-ink text-ink-foreground">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div className="space-y-4">
          <Logo tone="invert" />
          <p className="max-w-sm text-sm leading-relaxed text-ink-foreground/70">
            The Philippine marketplace and delivery platform built for local sellers, home-based
            entrepreneurs, riders and the customers who keep them busy.
          </p>
          <p className="text-xs text-ink-foreground/50">
            Serving Metro Manila, Cebu, Davao and growing.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title} className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-accent">
              {col.title}
            </h3>
            <ul className="space-y-2">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-sm text-ink-foreground/75 transition-colors hover:text-ink-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-ink-foreground/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-ink-foreground/50 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} RushOrder PH. All rights reserved.</p>
          <p>Built for Filipino businesses.</p>
        </div>
      </div>
    </footer>
  );
}
