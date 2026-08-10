// Absolute origin for links that leave the app — share pages, QR codes,
// anything sent over WhatsApp/email where a relative /share/[slug] path
// means nothing outside a browser tab already on this site. No existing
// convention for this in the app; NEXT_PUBLIC_APP_URL wins if set (for a
// custom domain), falling back to Vercel's own runtime-provided host.
export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
