// Plain international scale — thousand/million/billion — not Lakh/Crore.
export function formatCurrency(amount: number | null | undefined, currency = "LKR") {
  if (amount == null) return "-";
  if (currency === "LKR") {
    if (amount >= 1_000_000_000) return `Rs. ${(amount / 1_000_000_000).toFixed(2)} Billion`;
    if (amount >= 1_000_000) return `Rs. ${(amount / 1_000_000).toFixed(2)} Million`;
    return `Rs. ${amount.toLocaleString("en-LK")}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

export function formatDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Plain helper, not called inline during render — keeps `Date.now()` out of
// component/query-building expressions so React's purity check doesn't flag it.
export function daysAgoDate(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

export function daysAgo(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

// Handles both SCREAMING_SNAKE_CASE (enum values) and camelCase (feature
// keys like "swimmingPool") — splitting only on "_" left camelCase words
// concatenated (e.g. "Swimmingpool"), caught via a real screenshot review.
export function titleCase(s: string) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
