import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Fraunces + Plus Jakarta Sans, not the Instrument Serif + Manrope pairing
// nearly every AI-generated "premium" interface reaches for by default.
// Fraunces carries real weight (600/700 for headings, not just a hairline
// 400) so it reads as authoritative rather than decorative; Plus Jakarta
// Sans has more character than the ubiquitous startup-SaaS geometric sans
// while staying just as legible at small UI sizes.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Imperium Realty OS",
  description: "Property intelligence and deal management for the Sri Lankan real estate market.",
  manifest: "/manifest.json",
  icons: {
    icon: "/brand/favicon.png",
    apple: "/brand/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#091526",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ir-ivory text-ir-navy">{children}</body>
    </html>
  );
}
