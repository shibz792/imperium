// Central tone mapping so a given status always renders the same colour
// everywhere it appears (list rows, detail headers, kanban cards…).

export const LISTING_STATUS_TONE: Record<string, string> = {
  DRAFT: "gray",
  ACTIVE: "green",
  UNDER_OFFER: "amber",
  RESERVED: "amber",
  SOLD: "navy",
  RENTED: "navy",
  WITHDRAWN: "red",
  EXPIRED: "red",
};

export const REQUIREMENT_STATUS_TONE: Record<string, string> = {
  NEW: "blue",
  UNVERIFIED: "gray",
  QUALIFIED: "gold",
  ACTIVELY_SEARCHING: "green",
  OPTIONS_SHARED: "blue",
  VIEWING_ARRANGED: "amber",
  NEGOTIATING: "amber",
  ON_HOLD: "gray",
  COMPLETED: "navy",
  LOST_EXPIRED: "red",
};

export const DEAL_STAGE_TONE: Record<string, string> = {
  NEW_INQUIRY: "blue",
  CONTACT_ATTEMPTED: "blue",
  QUALIFIED: "gold",
  SHORTLISTED: "gold",
  VIEWING_ARRANGED: "amber",
  VIEWING_COMPLETED: "amber",
  NEGOTIATION: "amber",
  OFFER_SUBMITTED: "amber",
  AGREEMENT_PENDING: "green",
  CLOSED_WON: "green",
  CLOSED_LOST: "red",
};

export const URGENCY_TONE: Record<string, string> = {
  LOW: "gray",
  MEDIUM: "blue",
  HIGH: "amber",
  CRITICAL: "red",
};

export const LEGAL_STATUS_TONE: Record<string, string> = {
  UNVERIFIED: "gray",
  IN_PROGRESS: "amber",
  VERIFIED: "green",
  ISSUES_FOUND: "red",
};

export const COMMISSION_STATUS_TONE: Record<string, string> = {
  PENDING: "gray",
  INVOICED: "blue",
  PARTIALLY_PAID: "amber",
  PAID: "green",
  OVERDUE: "red",
};

export const VIEWING_STATUS_TONE: Record<string, string> = {
  SCHEDULED: "blue",
  CONFIRMED: "gold",
  COMPLETED: "green",
  CANCELLED: "red",
  NO_SHOW: "red",
};

export const OFFER_STATUS_TONE: Record<string, string> = {
  SUBMITTED: "blue",
  COUNTERED: "amber",
  ACCEPTED: "green",
  REJECTED: "red",
  WITHDRAWN: "gray",
};

export const DEAL_STAGES: string[] = [
  "NEW_INQUIRY",
  "CONTACT_ATTEMPTED",
  "QUALIFIED",
  "SHORTLISTED",
  "VIEWING_ARRANGED",
  "VIEWING_COMPLETED",
  "NEGOTIATION",
  "OFFER_SUBMITTED",
  "AGREEMENT_PENDING",
  "CLOSED_WON",
  "CLOSED_LOST",
];
