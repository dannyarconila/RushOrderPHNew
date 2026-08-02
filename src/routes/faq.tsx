import { createFileRoute } from "@tanstack/react-router";

import { PageHero, PublicLayout } from "@/components/site/public-layout";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — RushOrder PH" },
      {
        name: "description",
        content:
          "Answers about ordering, becoming a selling partner, rider requirements, verification documents and payouts on RushOrder PH.",
      },
      { property: "og:title", content: "RushOrder PH FAQ" },
      {
        property: "og:description",
        content: "Common questions from customers, sellers and riders.",
      },
    ],
  }),
  component: FaqPage,
});

const FAQS = [
  {
    q: "How do I start ordering?",
    a: "Create a free customer account, set your delivery address, then browse stores near you. Checkout supports cash on delivery and wallet payments.",
  },
  {
    q: "What is the difference between a registered and home-based seller?",
    a: "A registered business submits DTI/SEC or business permit details. A home-based seller submits a valid government ID and a selfie for identity verification. Both get a storefront once approved.",
  },
  {
    q: "How long does verification take?",
    a: "Most seller and rider applications are reviewed within 1 to 3 business days. You can track your status any time from your dashboard.",
  },
  {
    q: "What vehicles can riders use?",
    a: "Motorcycle, bicycle, tricycle, car or van. You will need a valid driver's licence for motorised vehicles, plus OR/CR where applicable.",
  },
  {
    q: "How are payouts handled?",
    a: "Selling partners and riders each have a wallet showing available and pending balances, with payout requests processed on a weekly cycle.",
  },
  {
    q: "Are my documents safe?",
    a: "Yes. Verification documents are stored in a private bucket that only you and our review team can access. They are never shown on your public storefront.",
  },
];

function FaqPage() {
  return (
    <PublicLayout>
      <PageHero
        eyebrow="Support"
        title="Frequently asked questions"
        description="Everything customers, selling partners and riders usually ask before joining RushOrder PH."
      />
      <section className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-left font-display text-base font-bold">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </PublicLayout>
  );
}
