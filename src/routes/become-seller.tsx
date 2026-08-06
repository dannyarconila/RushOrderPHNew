import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Building2, Home, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { DocumentUpload } from "@/components/forms/document-upload";
import {
  ReviewList,
  SelectField,
  Stepper,
  TextAreaField,
  TextField,
} from "@/components/forms/wizard";
import { PageHero, PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/use-auth";
import { supabase } from "@/integrations/supabase/client";
import type { SellerBusinessType } from "@/types";
import { cn } from "@/lib/utils";
import { LegalModal } from "@/components/legal/legal-modal";
import { legalDocumentQuery } from "@/lib/legal/public";

export const Route = createFileRoute("/become-seller")({
  head: () => ({
    meta: [
      { title: "Become a selling partner — RushOrder PH" },
      {
        name: "description",
        content:
          "Apply as a registered business or home-based seller on RushOrder PH. Submit your documents once and track your verification status.",
      },
      { property: "og:title", content: "Sell on RushOrder PH" },
      {
        property: "og:description",
        content: "Onboarding for registered businesses and home-based sellers.",
      },
    ],
  }),
  component: BecomeSellerPage,
});

const CATEGORIES = [
  "Food & Beverages",
  "Groceries",
  "Fashion & Apparel",
  "Health & Beauty",
  "Electronics",
  "Home & Living",
  "Baby & Kids",
  "Services",
] as const;

function mapStoreServiceType(category: string): "food" | "groceries" | "pharmacy" | "services" {
  const value = category.trim().toLowerCase();
  if (value.includes("grocer")) return "groceries";
  if (value.includes("health") || value.includes("pharmacy") || value.includes("beauty")) {
    return "pharmacy";
  }
  if (value.includes("food") || value.includes("beverage")) return "food";
  return "services";
}

const STEPS_REGISTERED = [
  "Business type",
  "Business info",
  "Owner",
  "Address",
  "Store",
  "Documents",
  "Review",
];
const STEPS_HOME = [
  "Business type",
  "Seller info",
  "Owner",
  "Address",
  "Store",
  "Documents",
  "Review",
];

function BecomeSellerPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [type, setType] = useState<SellerBusinessType | "">("");

  const [business, setBusiness] = useState({
    business_name: "",
    registration_type: "",
    registration_number: "",
    tin: "",
  });
  const [owner, setOwner] = useState({
    owner_name: "",
    owner_email: "",
    owner_phone: "",
    birthdate: "",
  });
  const [address, setAddress] = useState({
    street: "",
    barangay: "",
    city: "",
    province: "",
    postal_code: "",
  });
  const [store, setStore] = useState({
    store_name: "",
    category: "",
    description: "",
    prep_time: "",
  });
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [selectedLegalSlug, setSelectedLegalSlug] = useState("");
  const { data: legalDocument } = useQuery({
    ...legalDocumentQuery(selectedLegalSlug),
    enabled: showLegalModal && selectedLegalSlug.length > 0,
  });

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/login", search: { next: "/become-seller" }, replace: true });
  }, [loading, user, navigate]);

  const steps = type === "home_based" ? STEPS_HOME : STEPS_REGISTERED;

  function next() {
    if (step === 0 && !type) {
      toast.error("Choose how you sell to continue");
      return;
    }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function submit() {
    if (!user) return;
    if (!store.store_name || !address.city) {
      toast.error("Please complete your store name and address");
      return;
    }

    const ownerInfo = {
      ...owner,
      full_name: owner.owner_name,
      name: owner.owner_name,
      email: owner.owner_email,
      phone: owner.owner_phone,
    };

    const normalizedAddress = {
      ...address,
      line1: address.street,
    };

    const storeInfo = {
      ...store,
      service_type: mapStoreServiceType(store.category),
    };

    setSubmitting(true);
    const { error } = await supabase.from("seller_applications").insert({
      user_id: user.id,
      business_type: type as SellerBusinessType,
      business_info: business,
      owner_info: ownerInfo,
      address: normalizedAddress,
      store_info: storeInfo,
      documents,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit application", { description: error.message });
      return;
    }
    toast.success("Application submitted", {
      description: "We'll review your documents within 1–3 business days.",
    });
    navigate({ to: "/seller" });
  }

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Selling partners"
        title="Open your RushOrder PH storefront"
        description="Two onboarding paths — one for registered businesses, one for home-based sellers. Both take about five minutes."
      />

      <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <Stepper steps={steps} current={step} />

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
          {step === 0 ? (
            <div>
              <h2 className="font-display text-xl font-bold">How do you sell today?</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                This determines which documents we'll ask for.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  {
                    value: "registered" as const,
                    icon: Building2,
                    title: "Registered business",
                    body: "You have a DTI, SEC or business permit and issue official receipts.",
                  },
                  {
                    value: "home_based" as const,
                    icon: Home,
                    title: "Home-based seller",
                    body: "You cook, bake or craft from home and sell through social media today.",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={cn(
                      "rounded-2xl border p-5 text-left transition-colors",
                      type === opt.value
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="flex size-11 items-center justify-center rounded-xl bg-card text-primary shadow-[var(--shadow-soft)]">
                      <opt.icon className="size-5" />
                    </span>
                    <h3 className="mt-4 font-display text-base font-bold">{opt.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{opt.body}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label={type === "home_based" ? "Selling name" : "Registered business name"}
                value={business.business_name}
                onChange={(v) => setBusiness({ ...business, business_name: v })}
                placeholder="Lola's Kitchen"
              />
              {type === "registered" ? (
                <>
                  <SelectField
                    label="Registration type"
                    value={business.registration_type}
                    onChange={(v) => setBusiness({ ...business, registration_type: v })}
                    options={["DTI", "SEC", "CDA", "Barangay permit"]}
                  />
                  <TextField
                    label="Registration number"
                    value={business.registration_number}
                    onChange={(v) => setBusiness({ ...business, registration_number: v })}
                  />
                  <TextField
                    label="TIN"
                    value={business.tin}
                    onChange={(v) => setBusiness({ ...business, tin: v })}
                  />
                </>
              ) : (
                <TextField
                  label="Years selling"
                  value={business.registration_type}
                  onChange={(v) => setBusiness({ ...business, registration_type: v })}
                  placeholder="e.g. 2 years on Facebook"
                />
              )}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Owner full name"
                value={owner.owner_name}
                onChange={(v) => setOwner({ ...owner, owner_name: v })}
              />
              <TextField
                label="Owner email"
                type="email"
                value={owner.owner_email}
                onChange={(v) => setOwner({ ...owner, owner_email: v })}
              />
              <TextField
                label="Mobile number"
                value={owner.owner_phone}
                onChange={(v) => setOwner({ ...owner, owner_phone: v })}
              />
              <TextField
                label="Date of birth"
                type="date"
                value={owner.birthdate}
                onChange={(v) => setOwner({ ...owner, birthdate: v })}
              />
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Street / building"
                value={address.street}
                onChange={(v) => setAddress({ ...address, street: v })}
              />
              <TextField
                label="Barangay"
                value={address.barangay}
                onChange={(v) => setAddress({ ...address, barangay: v })}
              />
              <TextField
                label="City / municipality"
                value={address.city}
                onChange={(v) => setAddress({ ...address, city: v })}
              />
              <TextField
                label="Province"
                value={address.province}
                onChange={(v) => setAddress({ ...address, province: v })}
              />
              <TextField
                label="Postal code"
                value={address.postal_code}
                onChange={(v) => setAddress({ ...address, postal_code: v })}
              />
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label="Store name"
                  value={store.store_name}
                  onChange={(v) => setStore({ ...store, store_name: v })}
                />
                <SelectField
                  label="Primary category"
                  value={store.category}
                  onChange={(v) => setStore({ ...store, category: v })}
                  options={CATEGORIES}
                />
                <TextField
                  label="Average prep time"
                  value={store.prep_time}
                  onChange={(v) => setStore({ ...store, prep_time: v })}
                  placeholder="e.g. 20 minutes"
                />
              </div>
              <TextAreaField
                label="Store description"
                value={store.description}
                onChange={(v) => setStore({ ...store, description: v })}
                placeholder="Tell customers what makes your store special."
              />
            </div>
          ) : null}

          {step === 5 && user ? (
            <div className="grid gap-5">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Documents are stored privately and are visible only to you and our verification
                  team.
                </p>
              </div>
              {(type === "registered"
                ? [
                    { key: "business_permit", label: "Business permit" },
                    { key: "registration_certificate", label: "DTI / SEC certificate" },
                    { key: "valid_id", label: "Owner valid ID" },
                  ]
                : [
                    { key: "valid_id", label: "Government-issued ID" },
                    { key: "selfie_with_id", label: "Selfie holding your ID" },
                  ]
              ).map((doc) => (
                <DocumentUpload
                  key={doc.key}
                  label={doc.label}
                  userId={user.id}
                  folder={`seller/${doc.key}`}
                  value={documents[doc.key]}
                  onUploaded={(path) => setDocuments((d) => ({ ...d, [doc.key]: path }))}
                />
              ))}
            </div>
          ) : null}

          {step === 6 ? (
            <div className="grid gap-7">
              <h2 className="font-display text-xl font-bold">Review your application</h2>
              <ReviewList
                entries={[
                  [
                    "Seller type",
                    type === "home_based" ? "Home-based seller" : "Registered business",
                  ],
                  ...Object.entries({ ...business, ...owner, ...address, ...store }).map(
                    ([k, v]) => [k.replace(/_/g, " "), v] as [string, string],
                  ),
                  ["Documents uploaded", String(Object.keys(documents).length)],
                ]}
              />

              <div className="mt-8 rounded-xl border border-border bg-secondary/30 p-5">
                <h3 className="font-semibold">Legal Agreements</h3>

                <div className="mt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Privacy Policy</span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLegalSlug("privacy-policy");
                        setShowLegalModal(true);
                      }}
                    >
                      View
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm">Terms & Conditions</span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLegalSlug("terms-and-conditions");
                        setShowLegalModal(true);
                      }}
                    >
                      View
                    </Button>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm">Seller Partner Agreement</span>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLegalSlug("seller-partner-agreement");
                        setShowLegalModal(true);
                      }}
                    >
                      View
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border pt-6">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            {step === steps.length - 1 ? (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null} Submit application
              </Button>
            ) : (
              <Button onClick={next}>
                Continue <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Want to deliver instead?{" "}
          <Link to="/become-rider" className="font-semibold text-primary hover:underline">
            Apply as a rider
          </Link>
        </p>
      </section>

      <LegalModal
        open={showLegalModal}
        document={legalDocument ?? null}
        onClose={() => {
          setShowLegalModal(false);
          setSelectedLegalSlug("");
        }}
      />
    </PublicLayout>
  );
}
