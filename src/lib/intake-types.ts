// Shared shapes between the extraction engines (Groq / heuristic), the
// review UI, and the approve action. Kept deliberately close to the Prisma
// fields so "Approve" can map almost 1:1 into a create() call.

export type FieldConfidence = Record<string, number>; // field name -> 0-100

export type PropertyDraftFields = {
  title?: string;
  ownerName?: string;
  ownerPhone?: string;
  category?: "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL_LOGISTICS" | "LAND_AGRICULTURE";
  subtype?: string;
  transactionType?: "SALE" | "RENT" | "LEASE" | "SHORT_TERM_RENTAL" | "INVESTMENT" | "JOINT_VENTURE" | "DEVELOPMENT" | "OFF_MARKET";
  city?: string;
  district?: string;
  address?: string;
  sizeSqft?: number;
  sizePerches?: number;
  sizeAcres?: number;
  totalPrice?: number;
  monthlyRental?: number;
  annualLeaseValue?: number;
  currency?: string;
  bedrooms?: number;
  bathrooms?: number;
  floors?: number;
  priceNegotiable?: boolean;
  landmark?: string;
  features?: Record<string, boolean>;
  description?: string;
};

export type RequirementDraftFields = {
  clientName?: string;
  clientPhone?: string;
  title?: string;
  dealType?: "BUY" | "RENT" | "LEASE";
  category?: "RESIDENTIAL" | "COMMERCIAL" | "INDUSTRIAL_LOGISTICS" | "LAND_AGRICULTURE";
  subtype?: string;
  locations?: string[];
  sizeMin?: number;
  sizeMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  requiredFeatures?: Record<string, boolean>;
  urgency?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  intendedUse?: string;
  notes?: string;
};

// A note-derived follow-up — deliberately much thinner than the property/
// requirement shapes above. dueAt is an ISO string, not a Date, so this
// stays JSON-safe end to end (Groq response → client state → server action).
export type TaskDraftFields = {
  title?: string;
  dueAt?: string;
  type?: "CONTACT_INQUIRY" | "VIEWING_CONFIRM" | "CLIENT_UPDATE" | "LISTING_VERIFY" | "OFFER_RESPONSE" | "LEASE_EXPIRY" | "REQUIREMENT_RECONFIRM" | "CUSTOM";
};

export type DuplicateHint = {
  type: "property" | "requirement" | "contact";
  id: string;
  ref: string;
  label: string;
  reason: string;
};

export type Draft = {
  id: string; // client-side temp id
  kind: "property" | "requirement" | "task";
  sourceExcerpt: string;
  confidence: number; // overall 0-100
  fieldConfidence: FieldConfidence;
  fields: PropertyDraftFields | RequirementDraftFields | TaskDraftFields;
  missingFields: string[];
  suggestedFollowUp?: string;
  duplicates: DuplicateHint[];
};

export type IntakeResult = {
  engine: "groq" | "heuristic";
  drafts: Draft[];
};
