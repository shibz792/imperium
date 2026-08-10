import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { Property } from "@/generated/prisma/client";
import { formatCurrency, titleCase } from "@/lib/format";
import { relevantAskingPrice, priceUnit, primarySize } from "@/lib/property";

// Standard 14 PDF fonts only (Helvetica family) — no embedded font files.
// Same reasoning as the SVG overlay in marketingImage.ts: a font that
// silently fails to load in a serverless environment is worse than one
// guaranteed to always resolve. Verified this whole approach (cover-fit
// photo placement, QR embedding, multi-page text flow) against pdfkit
// directly before wiring it in here.
const NAVY = "#091526";
const GOLD = "#cca274";
const IVORY = "#f5f2ed";

export async function composeBrochure(opts: {
  property: Property;
  brochureText: string;
  photoBuffer: Buffer | null;
  shareUrl: string | null;
}): Promise<Buffer> {
  const { property: p, brochureText, photoBuffer, shareUrl } = opts;
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pw = doc.page.width;
  const ph = doc.page.height;
  const coverPhotoHeight = ph * 0.58;

  // --- Cover page ---
  doc.rect(0, 0, pw, ph).fill(NAVY);
  if (photoBuffer) {
    try {
      doc.image(photoBuffer, 0, 0, { width: pw, height: coverPhotoHeight, cover: [pw, coverPhotoHeight], align: "center", valign: "center" });
      // A scrim between the photo and the text below it, same "hairline
      // over shadow" restraint as the rest of the brand — just a flat
      // navy band, not a gradient overlay on the photo itself.
      doc.rect(0, coverPhotoHeight - 2, pw, 2).fill(GOLD);
    } catch {
      // Unreadable image buffer — the cover stays a plain navy panel below.
    }
  }

  const textTop = coverPhotoHeight + 42;
  doc.fillColor(GOLD).fontSize(10).font("Helvetica-Bold").text("IMPERIUM REALTY", 48, textTop, { characterSpacing: 2 });
  doc.fillColor(IVORY).fontSize(26).font("Helvetica-Bold").text(p.title, 48, textTop + 22, { width: pw - 96 });
  const price = relevantAskingPrice(p);
  const priceLine = price ? `${formatCurrency(price, p.currency)}${priceUnit(p)}` : "Price on request";
  doc.fillColor(GOLD).fontSize(18).font("Helvetica-Bold").text(priceLine, 48, doc.y + 10);
  const location = [p.city, p.district].filter(Boolean).join(", ");
  if (location) doc.fillColor(IVORY).fillOpacity(0.7).fontSize(11).font("Helvetica").text(location, 48, doc.y + 8);
  doc.fillOpacity(1);

  // --- Facts + copy page ---
  doc.addPage({ size: "A4", margin: 48 });
  doc.fillColor(NAVY).fontSize(18).font("Helvetica-Bold").text("Property Details");
  doc.moveDown(0.6);

  const size = primarySize(p);
  const facts: [string, string | undefined][] = [
    ["Type", `${titleCase(p.subtype)} · ${titleCase(p.transactionType)}`],
    ["Size", size ?? undefined],
    ["Bedrooms", p.bedrooms ? String(p.bedrooms) : undefined],
    ["Bathrooms", p.bathrooms ? String(p.bathrooms) : undefined],
    ["Location", location || undefined],
  ];
  for (const [label, value] of facts) {
    if (!value) continue;
    doc.fontSize(10).font("Helvetica-Bold").fillColor(NAVY).text(`${label}:  `, { continued: true }).font("Helvetica").fillColor("#444").text(value);
  }

  const features = p.featuresJson && typeof p.featuresJson === "object" ? Object.keys(p.featuresJson as object) : [];
  if (features.length > 0) {
    doc.moveDown(0.8);
    doc.fontSize(10).font("Helvetica-Bold").fillColor(NAVY).text("Features");
    doc.fontSize(10).font("Helvetica").fillColor("#444").text(features.map(titleCase).join("  ·  "), { lineGap: 3 });
  }

  doc.moveDown(1.2);
  doc.fontSize(11).font("Helvetica").fillColor("#333").text(brochureText, { align: "left", lineGap: 5 });

  if (shareUrl) {
    try {
      const qrBuffer = await QRCode.toBuffer(shareUrl, { margin: 1, width: 160, color: { dark: NAVY, light: "#FFFFFF" } });
      const qrSize = 90;
      const qrX = pw - 48 - qrSize;
      const qrY = ph - 48 - qrSize;
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      doc.fontSize(8).fillColor("#888").font("Helvetica").text("Scan to view online", qrX, qrY - 14, { width: qrSize, align: "center" });
    } catch {
      // QR generation failing shouldn't block the brochure itself.
    }
  }

  doc.end();
  return done;
}
