export type LegalSlug =
  | "terms-conditions"
  | "privacy-policy"
  | "seller-terms-conditions"
  | "rider-terms-conditions"
  | "acceptable-use-policy"
  | "prohibited-items-policy"
  | "refund-cancellation-policy"
  | "community-guidelines"
  | "cookie-policy"
  | "intellectual-property-policy"
  | "data-privacy-notice"
  | "trust-safety"
  | "contact-legal-inquiries";

export interface LegalSection {
  id: string;
  title: string;
  body: string[];
}

export interface LegalDocumentTemplate {
  slug: LegalSlug;
  title: string;
  summary: string;
  seoDescription: string;
  sections: LegalSection[];
}

export interface LegalDocVersion {
  version: string;
  publishedAt: string;
  updatedAt: string;
  updatedBy: string;
  content?: string | null;
}

export interface LegalDocumentResolved extends LegalDocumentTemplate, LegalDocVersion {
  lastUpdatedLabel: string;
  toc: { id: string; title: string }[];
}

export const LEGAL_CENTER_LAST_UPDATED = "2026-08-04";

const termsSections: LegalSection[] = [
  {
    id: "account-registration",
    title: "Account Registration",
    body: [
      "You must provide accurate, complete, and current information when creating or maintaining an account.",
      "You are responsible for account confidentiality, account activity, and safeguarding login credentials.",
      "RushOrder PH may suspend or terminate accounts with inaccurate data, identity fraud, or repeated policy violations.",
    ],
  },
  {
    id: "marketplace-rules",
    title: "Marketplace Rules",
    body: [
      "Users must follow all platform policies, local laws, and fair-use standards when buying, selling, and delivering.",
      "Listings, requests, and communications must be truthful and must not mislead customers, sellers, or riders.",
      "RushOrder PH may moderate, remove, or restrict content and activity to protect marketplace integrity.",
    ],
  },
  {
    id: "orders-payments-wallet",
    title: "Orders, Payments, and Wallet",
    body: [
      "Order placement constitutes a request to transact subject to availability, verification, pricing validation, and serviceability.",
      "Payment methods may include cash, e-wallets, or in-app wallet, depending on availability and compliance checks.",
      "Wallet balances, top-ups, and deductions are subject to anti-fraud controls, reconciliations, and transaction audits.",
    ],
  },
  {
    id: "deliveries-refunds-cancellations",
    title: "Deliveries, Refunds, and Cancellations",
    body: [
      "Delivery timelines are best-effort estimates and may vary due to weather, traffic, rider safety, and merchant readiness.",
      "Refund and cancellation handling follows the Refund & Cancellation Policy and may require supporting evidence.",
      "Platform fees and adjustments may apply for failed attempts, abuse patterns, or policy-defined exceptions.",
    ],
  },
  {
    id: "suspension-fraud-abuse",
    title: "Suspension, Fraud, and Abuse",
    body: [
      "Fraud, abuse, impersonation, payment manipulation, fake orders, and policy evasion are prohibited.",
      "RushOrder PH may limit, suspend, or permanently ban accounts involved in suspicious or abusive behavior.",
      "Serious violations may be escalated to law enforcement and competent Philippine regulatory authorities.",
    ],
  },
  {
    id: "ip-liability-force-majeure",
    title: "Intellectual Property, Liability, and Force Majeure",
    body: [
      "All platform software, branding, and proprietary materials are protected by applicable intellectual property laws.",
      "RushOrder PH is not liable for indirect, incidental, or consequential damages to the fullest extent permitted by law.",
      "Service obligations may be delayed or suspended due to force majeure events beyond reasonable control.",
    ],
  },
  {
    id: "governing-law-disputes",
    title: "Governing Law and Dispute Resolution",
    body: [
      "These terms are governed by the laws of the Republic of the Philippines.",
      "Disputes should first undergo good-faith resolution through support and legal channels.",
      "Unresolved disputes are subject to Philippine jurisdiction and proper venue under applicable law.",
    ],
  },
];

const privacySections: LegalSection[] = [
  {
    id: "data-collected",
    title: "Personal and Sensitive Information Collected",
    body: [
      "RushOrder PH may collect personal data including name, contact details, addresses, payment references, and account identifiers.",
      "For compliance and verification, we may process government IDs, driver's licenses, business permits, and supporting documents.",
      "Device, IP, session, and app telemetry may be collected for platform security, fraud prevention, and diagnostics.",
    ],
  },
  {
    id: "location-cookies-analytics",
    title: "Location, Cookies, and Analytics",
    body: [
      "Location data may be processed to support address validation, rider dispatch, delivery ETA, and safety operations.",
      "Cookies and similar technologies are used for authentication, security, preferences, analytics, and service performance.",
      "Analytics and marketing tools may be used in compliance with lawful basis, consent requirements, and user controls.",
    ],
  },
  {
    id: "use-sharing-retention",
    title: "Use, Sharing, and Data Retention",
    body: [
      "Data is used for account services, order processing, support, legal compliance, fraud detection, and service improvements.",
      "We may share data with service providers, payment processors, cloud partners, and lawful government requests where required.",
      "Retention periods are set by operational need, legal obligations, anti-fraud controls, and audit requirements.",
    ],
  },
  {
    id: "user-rights",
    title: "User Rights Under the Philippine Data Privacy Act of 2012",
    body: [
      "Data subjects may request access, correction, objection, erasure/blocking, portability (where applicable), and complaint handling.",
      "Users may request account deletion, subject to legal, tax, fraud, and dispute-related retention obligations.",
      "For requests, contact legal/privacy channels listed in Contact & Legal Inquiries.",
    ],
  },
];

const sellerSections: LegalSection[] = [
  {
    id: "seller-eligibility",
    title: "Eligibility and Business Registration",
    body: [
      "Sellers must provide accurate business identity, ownership details, and registration status during onboarding.",
      "Business permits, tax registrations, and other lawful authorizations must remain valid at all times.",
      "RushOrder PH may require periodic reverification and supporting documents for continued platform access.",
    ],
  },
  {
    id: "store-listings-pricing-inventory",
    title: "Store Listings, Pricing, and Inventory Accuracy",
    body: [
      "Product listings, descriptions, pricing, and stock levels must be accurate and kept up to date.",
      "Sellers are responsible for timely order acceptance, fulfillment quality, and customer communication.",
      "Inventory misrepresentation, deceptive pricing, and repeated stock failures may trigger enforcement actions.",
    ],
  },
  {
    id: "fulfillment-refunds-service",
    title: "Order Fulfillment, Refunds, and Customer Service",
    body: [
      "Sellers must prepare and release orders according to platform standards and agreed service timelines.",
      "Refunds, returns, and dispute handling must follow platform policy and lawful consumer protection rules.",
      "Seller ratings and quality metrics may affect visibility, incentives, and account standing.",
    ],
  },
  {
    id: "seller-compliance-enforcement",
    title: "Fraud Prevention, Restricted Products, and Enforcement",
    body: [
      "Sellers must not list restricted or prohibited items and must comply with all applicable Philippine laws.",
      "Fraud, fake fulfillment, collusion, and abusive conduct may lead to store suspension or account termination.",
      "RushOrder PH may remove listings, pause stores, or terminate seller access for severe or repeated violations.",
    ],
  },
];

const riderSections: LegalSection[] = [
  {
    id: "rider-eligibility-documents",
    title: "Eligibility, Driver's License, Vehicle Registration, and Insurance",
    body: [
      "Riders must be legally eligible, properly identified, and accurately registered with required credentials.",
      "Motorized riders must maintain valid driver's licenses, OR/CR documents, and legally required insurance coverage.",
      "Documentation must stay current; expired or inaccurate records may result in account restrictions.",
    ],
  },
  {
    id: "rider-safety-compliance",
    title: "Safety and Traffic Law Compliance",
    body: [
      "Riders must comply with traffic laws, safety standards, and lawful road-use requirements at all times.",
      "Unsafe behavior, reckless driving, intoxication, or delivery handling negligence is strictly prohibited.",
      "RushOrder PH may monitor route integrity and safety signals for trust and incident prevention.",
    ],
  },
  {
    id: "delivery-operations-conduct",
    title: "Order Acceptance, Delivery Standards, Cash Handling, and Conduct",
    body: [
      "Riders are expected to manage order acceptance responsibly and complete deliveries professionally.",
      "Cash and payment handling must follow platform procedures, reconciliation rules, and anti-fraud controls.",
      "Code of conduct, uniform standards, and respectful communication are mandatory in all rider interactions.",
    ],
  },
  {
    id: "rider-enforcement",
    title: "Fraud Prevention, Suspension, and Termination",
    body: [
      "Fake deliveries, collusion, theft, account sharing, and manipulated GPS activity are prohibited.",
      "RushOrder PH may suspend, restrict, or terminate rider accounts for policy breaches or safety risks.",
      "Severe incidents may be referred to law enforcement and relevant Philippine authorities.",
    ],
  },
];

const acceptableUseSections: LegalSection[] = [
  {
    id: "acceptable-use-rules",
    title: "Acceptable Use Rules",
    body: [
      "No fraud, no fake orders, no fake accounts, and no manipulation of reviews, rankings, or transactions.",
      "No harassment, threats, hate speech, abusive behavior, or targeted attacks against any user group.",
      "No spam, malware, phishing, illegal activity, or copyright and trademark infringement.",
    ],
  },
];

const prohibitedItemsSections: LegalSection[] = [
  {
    id: "prohibited-items-list",
    title: "Prohibited Items",
    body: [
      "Illegal drugs, controlled substances, and illegal medicines.",
      "Firearms, ammunition, explosives, and weapons components.",
      "Counterfeit goods, pirated materials, and trademark-infringing items.",
      "Live animals, human organs, hazardous chemicals, and unlawful biological materials.",
      "Illegal gambling materials and any item prohibited under Philippine law.",
    ],
  },
];

const refundSections: LegalSection[] = [
  {
    id: "refund-customer",
    title: "Customer Refunds",
    body: [
      "Customers may request refunds for non-delivery, materially damaged orders, incorrect items, or verified service failure.",
      "Supporting evidence may be required, including photos, timestamps, and order communication history.",
    ],
  },
  {
    id: "refund-seller-wallet",
    title: "Seller Refunds and Wallet Refunds",
    body: [
      "Seller-side adjustments may apply where operational errors, abuse flags, or payment reconciliation issues are confirmed.",
      "Wallet refund credits are subject to validation, fraud checks, and platform accounting controls.",
    ],
  },
  {
    id: "cancellation-rules",
    title: "Cancellation Rules, Late Delivery, and Damaged Orders",
    body: [
      "Cancellations may be restricted after order processing milestones and dispatch events.",
      "Late delivery and damaged-order claims are evaluated based on fulfillment logs, rider updates, and incident reports.",
    ],
  },
];

const communitySections: LegalSection[] = [
  {
    id: "community-standards",
    title: "Community Standards",
    body: [
      "Respect everyone. Treat customers, sellers, riders, and support teams with professionalism.",
      "No abuse, no hate speech, and no harassment in messages, calls, profiles, and order interactions.",
      "Repeated misconduct may lead to platform restrictions, suspension, or permanent removal.",
    ],
  },
];

const cookieSections: LegalSection[] = [
  {
    id: "cookie-categories",
    title: "Cookie Categories",
    body: [
      "Essential cookies are required for authentication, security, and core platform operation.",
      "Analytics cookies help us understand usage patterns and improve product quality.",
      "Performance cookies support reliability, latency monitoring, and diagnostics.",
      "Marketing cookies may be used for campaign measurement and personalized communication where permitted.",
    ],
  },
];

const ipSections: LegalSection[] = [
  {
    id: "ip-ownership",
    title: "Intellectual Property Ownership and Use",
    body: [
      "RushOrder PH retains rights in platform software, UI, branding, logos, and proprietary content.",
      "Users may not copy, reverse engineer, redistribute, or commercially exploit protected materials without written permission.",
      "Rights holders may submit infringement complaints through Contact & Legal Inquiries.",
    ],
  },
];

const dataNoticeSections: LegalSection[] = [
  {
    id: "dpa-notice",
    title: "Data Privacy Notice (Philippine Data Privacy Act of 2012)",
    body: [
      "RushOrder PH processes personal data pursuant to lawful bases under the Data Privacy Act of 2012 and implementing regulations.",
      "Sensitive data is protected through technical, contractual, and organizational safeguards proportionate to risk.",
      "Data subjects may exercise rights and escalate concerns through our legal and privacy contact channels.",
    ],
  },
];

const trustSections: LegalSection[] = [
  {
    id: "trust-controls",
    title: "Identity Verification and Trust Controls",
    body: [
      "We use identity and document verification workflows to reduce impersonation and unauthorized access risk.",
      "Fraud detection models and operational review signals help detect suspicious behavior and transaction abuse.",
      "Security monitoring and account protection controls are continuously improved to protect platform participants.",
    ],
  },
];

const contactSections: LegalSection[] = [
  {
    id: "legal-contact",
    title: "Contact and Legal Inquiries",
    body: [
      "For legal notices, policy clarifications, and regulatory concerns, contact legal@rushorderph.online.",
      "For privacy requests under the Data Privacy Act, contact privacy@rushorderph.online.",
      "General support is available through the in-app support and contact channels on RushOrder PH.",
    ],
  },
];

export const LEGAL_DOCUMENTS: LegalDocumentTemplate[] = [
  {
    slug: "terms-conditions",
    title: "Terms & Conditions",
    summary: "General terms for all RushOrder PH users.",
    seoDescription:
      "RushOrder PH Terms & Conditions for customers, sellers, and riders in the Philippines.",
    sections: termsSections,
  },
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    summary: "How RushOrder PH collects, uses, and protects personal data.",
    seoDescription:
      "RushOrder PH Privacy Policy aligned with the Philippine Data Privacy Act of 2012.",
    sections: privacySections,
  },
  {
    slug: "seller-terms-conditions",
    title: "Seller Terms & Conditions",
    summary: "Rules and responsibilities for selling partners.",
    seoDescription: "Seller Terms & Conditions for RushOrder PH selling partners.",
    sections: sellerSections,
  },
  {
    slug: "rider-terms-conditions",
    title: "Rider Terms & Conditions",
    summary: "Rules and responsibilities for riders.",
    seoDescription: "Rider Terms & Conditions for RushOrder PH riders and delivery partners.",
    sections: riderSections,
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    summary: "Permitted behavior and safe platform usage standards.",
    seoDescription: "Acceptable Use Policy for RushOrder PH marketplace and delivery platform.",
    sections: acceptableUseSections,
  },
  {
    slug: "prohibited-items-policy",
    title: "Prohibited Items Policy",
    summary: "Items and categories not allowed on the platform.",
    seoDescription: "Prohibited Items Policy for RushOrder PH deliveries and marketplace listings.",
    sections: prohibitedItemsSections,
  },
  {
    slug: "refund-cancellation-policy",
    title: "Refund & Cancellation Policy",
    summary: "Refund eligibility and cancellation rules.",
    seoDescription: "Refund & Cancellation Policy for RushOrder PH customers and sellers.",
    sections: refundSections,
  },
  {
    slug: "community-guidelines",
    title: "Community Guidelines",
    summary: "Respectful behavior and conduct standards.",
    seoDescription: "RushOrder PH Community Guidelines for customers, sellers, riders, and staff.",
    sections: communitySections,
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    summary: "Cookie categories and usage transparency.",
    seoDescription:
      "RushOrder PH Cookie Policy covering essential, analytics, and marketing cookies.",
    sections: cookieSections,
  },
  {
    slug: "intellectual-property-policy",
    title: "Intellectual Property Policy",
    summary: "Ownership rights and infringement reporting.",
    seoDescription:
      "Intellectual Property Policy for RushOrder PH platform and user-generated content.",
    sections: ipSections,
  },
  {
    slug: "data-privacy-notice",
    title: "Data Privacy Notice",
    summary: "Privacy rights and compliance under Philippine law.",
    seoDescription:
      "Data Privacy Notice for RushOrder PH under the Philippine Data Privacy Act of 2012.",
    sections: dataNoticeSections,
  },
  {
    slug: "trust-safety",
    title: "Trust & Safety",
    summary: "Identity checks, fraud detection, and account protection.",
    seoDescription: "Trust & Safety framework of RushOrder PH for secure commerce and delivery.",
    sections: trustSections,
  },
  {
    slug: "contact-legal-inquiries",
    title: "Contact & Legal Inquiries",
    summary: "Where to send legal and privacy requests.",
    seoDescription: "Legal and privacy contact channels for RushOrder PH inquiries and notices.",
    sections: contactSections,
  },
];

export const LEGAL_BY_SLUG = Object.fromEntries(
  LEGAL_DOCUMENTS.map((doc) => [doc.slug, doc]),
) as Record<LegalSlug, LegalDocumentTemplate>;

export const DEFAULT_LEGAL_VERSIONS = {
  terms: "1.0.0",
  privacy: "1.0.0",
  sellerTerms: "1.0.0",
  riderTerms: "1.0.0",
} as const;

export function readableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function mergeLegalDocument(
  slug: LegalSlug,
  version: LegalDocVersion | null,
): LegalDocumentResolved {
  const base = LEGAL_BY_SLUG[slug];
  const resolvedVersion = version ?? {
    version: "1.0.0",
    publishedAt: LEGAL_CENTER_LAST_UPDATED,
    updatedAt: LEGAL_CENTER_LAST_UPDATED,
    updatedBy: "RushOrder PH Legal Team",
    content: null,
  };

  const contentSections =
    resolvedVersion.content && resolvedVersion.content.trim().length > 0
      ? resolvedVersion.content.split("\n\n").map((block, index) => ({
          id: `custom-${index + 1}`,
          title: index === 0 ? "Policy" : `Policy ${index + 1}`,
          body: [block.trim()],
        }))
      : base.sections;

  return {
    ...base,
    ...resolvedVersion,
    sections: contentSections,
    toc: contentSections.map((section) => ({ id: section.id, title: section.title })),
    lastUpdatedLabel: readableDate(resolvedVersion.updatedAt),
  };
}
