import { Check } from "lucide-react";
import type { ChangeEvent, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
              active && "border-primary bg-primary-soft text-primary",
              done && "border-success/40 bg-success/10 text-success",
              !active && !done && "border-border bg-card text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-[0.65rem] font-bold",
                active && "bg-primary text-primary-foreground",
                done && "bg-success text-success-foreground",
                !active && !done && "bg-secondary text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-input bg-card px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30";

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  required,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  required?: boolean;
  error?: boolean;
}) {
  return (
    <Field label={label} hint={hint} className={error ? "text-destructive" : undefined}>
      <input
        className={cn(
          inputClass,
          error &&
            "border-destructive bg-destructive/5 focus-visible:border-destructive focus-visible:ring-destructive/30",
        )}
        value={value}
        type={type}
        required={required}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea
        className="min-h-28 w-full rounded-xl border border-input bg-card px-4 py-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <select className={inputClass} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function ReviewList({ entries }: { entries: [string, string][] }) {
  const filled = entries.filter(([, v]) => v);
  if (filled.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing captured in this section yet.</p>;
  }
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {filled.map(([key, value]) => (
        <div key={key}>
          <dt className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {key}
          </dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
