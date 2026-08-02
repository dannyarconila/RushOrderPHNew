import { createFileRoute } from "@tanstack/react-router";
import { Mail, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHero, PublicLayout } from "@/components/site/public-layout";
import { TextAreaField, TextField } from "@/components/forms/wizard";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact RushOrder PH" },
      {
        name: "description",
        content:
          "Reach the RushOrder PH team for partner onboarding, rider support or general marketplace questions.",
      },
      { property: "og:title", content: "Contact RushOrder PH" },
      { property: "og:description", content: "Partner, rider and customer support channels." },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Contact"
        title="Talk to the RushOrder PH team"
        description="Partner onboarding, rider support, or a question about an order — send us a note and we'll respond within one business day."
      />
      <section className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:px-8">
        <form
          className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name || !email || !message) {
              toast.error("Please complete all fields");
              return;
            }
            toast.success("Message sent", {
              description: "Our team will get back to you shortly.",
            });
            setName("");
            setEmail("");
            setMessage("");
          }}
        >
          <h2 className="font-display text-xl font-bold">Send a message</h2>
          <div className="mt-6 grid gap-5">
            <TextField
              label="Full name"
              value={name}
              onChange={setName}
              placeholder="Juan dela Cruz"
            />
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@email.com"
            />
            <TextAreaField
              label="Message"
              value={message}
              onChange={setMessage}
              placeholder="How can we help?"
            />
          </div>
          <Button type="submit" className="mt-6">
            Send message
          </Button>
        </form>

        <aside className="space-y-4">
          {[
            { icon: Mail, label: "Email", value: "support@rushorder.ph" },
            { icon: Phone, label: "Hotline", value: "+63 2 8555 0199" },
            { icon: MapPin, label: "Office", value: "Bonifacio Global City, Taguig, Metro Manila" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <item.icon className="size-4" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-semibold">{item.value}</p>
              </div>
            </div>
          ))}
        </aside>
      </section>
    </PublicLayout>
  );
}
