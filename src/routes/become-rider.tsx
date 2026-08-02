import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { DocumentUpload } from "@/components/forms/document-upload";
import { ReviewList, SelectField, Stepper, TextField } from "@/components/forms/wizard";
import { PageHero, PublicLayout } from "@/components/site/public-layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/become-rider")({
  head: () => ({
    meta: [
      { title: "Become a rider — RushOrder PH" },
      {
        name: "description",
        content:
          "Earn on your own schedule as a RushOrder PH rider. Submit your licence, vehicle details and emergency contact to get verified.",
      },
      { property: "og:title", content: "Ride with RushOrder PH" },
      {
        property: "og:description",
        content: "Flexible delivery work with transparent weekly payouts.",
      },
    ],
  }),
  component: BecomeRiderPage,
});

const VEHICLES = ["Motorcycle", "Bicycle", "Tricycle", "Car", "Van"] as const;
const STEPS = ["Personal", "Address", "Vehicle", "Documents", "Emergency", "Review"];

function BecomeRiderPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [personal, setPersonal] = useState({ full_name: "", email: "", phone: "", birthdate: "" });
  const [address, setAddress] = useState({
    street: "",
    barangay: "",
    city: "",
    province: "",
    postal_code: "",
  });
  const [vehicle, setVehicle] = useState({
    vehicle_type: "",
    plate_number: "",
    model: "",
    license_number: "",
  });
  const [documents, setDocuments] = useState<Record<string, string>>({});
  const [emergency, setEmergency] = useState({
    contact_name: "",
    relationship: "",
    contact_phone: "",
  });

  useEffect(() => {
    if (!loading && !user)
      navigate({ to: "/login", search: { next: "/become-rider" }, replace: true });
  }, [loading, user, navigate]);

  async function submit() {
    if (!user) return;
    if (!personal.full_name || !vehicle.vehicle_type) {
      toast.error("Please complete your name and vehicle type");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("rider_applications").insert({
      user_id: user.id,
      personal_info: personal,
      address,
      vehicle_info: vehicle,
      documents,
      emergency_contact: emergency,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Could not submit application", { description: error.message });
      return;
    }
    toast.success("Application submitted", {
      description: "We'll review your documents within 1–3 business days.",
    });
    navigate({ to: "/rider" });
  }

  const motorised = vehicle.vehicle_type && vehicle.vehicle_type !== "Bicycle";

  return (
    <PublicLayout>
      <PageHero
        eyebrow="Riders"
        title="Deliver with RushOrder PH"
        description="Choose your hours, pick up orders near you, and track every peso you earn from your rider wallet."
      />

      <section className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <Stepper steps={STEPS} current={step} />

        <div className="mt-8 rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-soft)] sm:p-8">
          {step === 0 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Full name"
                value={personal.full_name}
                onChange={(v) => setPersonal({ ...personal, full_name: v })}
              />
              <TextField
                label="Email"
                type="email"
                value={personal.email}
                onChange={(v) => setPersonal({ ...personal, email: v })}
              />
              <TextField
                label="Mobile number"
                value={personal.phone}
                onChange={(v) => setPersonal({ ...personal, phone: v })}
              />
              <TextField
                label="Date of birth"
                type="date"
                value={personal.birthdate}
                onChange={(v) => setPersonal({ ...personal, birthdate: v })}
              />
            </div>
          ) : null}

          {step === 1 ? (
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

          {step === 2 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Vehicle type"
                value={vehicle.vehicle_type}
                onChange={(v) => setVehicle({ ...vehicle, vehicle_type: v })}
                options={VEHICLES}
              />
              <TextField
                label="Make & model"
                value={vehicle.model}
                onChange={(v) => setVehicle({ ...vehicle, model: v })}
                placeholder="Honda Click 125i"
              />
              {motorised ? (
                <>
                  <TextField
                    label="Plate number"
                    value={vehicle.plate_number}
                    onChange={(v) => setVehicle({ ...vehicle, plate_number: v })}
                  />
                  <TextField
                    label="Driver's licence number"
                    value={vehicle.license_number}
                    onChange={(v) => setVehicle({ ...vehicle, license_number: v })}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          {step === 3 && user ? (
            <div className="grid gap-5">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/50 p-4">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Uploads are private. Only you and the RushOrder PH verification team can open
                  them.
                </p>
              </div>
              {[
                { key: "valid_id", label: "Government-issued ID" },
                { key: "selfie_with_id", label: "Selfie holding your ID" },
                ...(motorised
                  ? [
                      { key: "drivers_license", label: "Driver's licence" },
                      { key: "or_cr", label: "Vehicle OR / CR" },
                    ]
                  : []),
              ].map((doc) => (
                <DocumentUpload
                  key={doc.key}
                  label={doc.label}
                  userId={user.id}
                  folder={`rider/${doc.key}`}
                  value={documents[doc.key]}
                  onUploaded={(path) => setDocuments((d) => ({ ...d, [doc.key]: path }))}
                />
              ))}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                label="Contact name"
                value={emergency.contact_name}
                onChange={(v) => setEmergency({ ...emergency, contact_name: v })}
              />
              <TextField
                label="Relationship"
                value={emergency.relationship}
                onChange={(v) => setEmergency({ ...emergency, relationship: v })}
              />
              <TextField
                label="Contact number"
                value={emergency.contact_phone}
                onChange={(v) => setEmergency({ ...emergency, contact_phone: v })}
              />
            </div>
          ) : null}

          {step === 5 ? (
            <div className="grid gap-7">
              <h2 className="font-display text-xl font-bold">Review your application</h2>
              <ReviewList
                entries={[
                  ...Object.entries({ ...personal, ...address, ...vehicle, ...emergency }).map(
                    ([k, v]) => [k.replace(/_/g, " "), v] as [string, string],
                  ),
                  ["Documents uploaded", String(Object.keys(documents).length)],
                ]}
              />
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
            {step === STEPS.length - 1 ? (
              <Button onClick={submit} disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null} Submit application
              </Button>
            ) : (
              <Button onClick={() => setStep((s) => Math.min(s + 1, STEPS.length - 1))}>
                Continue <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Prefer to sell?{" "}
          <Link to="/become-seller" className="font-semibold text-primary hover:underline">
            Become a selling partner
          </Link>
        </p>
      </section>
    </PublicLayout>
  );
}
