import { prisma } from "@/lib/prisma";
import { canSeeConfidential, requireRole } from "@/lib/auth";
import { DOCUMENT_ROLES } from "@/lib/roles";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatDate, titleCase } from "@/lib/format";
import { uploadDocument, importDocumentsFromDrive } from "./actions";
import { GoogleDriveBrowser } from "@/components/GoogleDriveBrowser";
import { SubmitButton } from "@/components/SubmitButton";
import { Lock, Download } from "lucide-react";

const CATEGORIES = ["DEED", "SURVEY_PLAN", "COC", "APPROVED_PLAN", "MUNICIPAL", "TAX", "AGREEMENT", "IDENTIFICATION", "OTHER"];

export default async function DocumentsPage() {
  const user = await requireRole(DOCUMENT_ROLES);
  const showConfidential = canSeeConfidential(user);

  const [documents, properties, contacts] = await Promise.all([
    prisma.document.findMany({ include: { property: true, contact: true, uploadedBy: true }, orderBy: { createdAt: "desc" } }),
    prisma.property.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.contact.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow={`Document Vault · ${documents.length}`}
        title="Deeds, plans, approvals, agreements & IDs"
        description="Downloads are gated by role. Confidential documents require a confidential-access role and every download is logged to the audit trail."
        actions={<GoogleDriveBrowser onImport={importDocumentsFromDrive} />}
      />

      <form action={uploadDocument} className="ir-card mb-6 grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-2">
          <label className="ir-label mb-1 block">File</label>
          <input name="file" type="file" required className="ir-input !py-1.5" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Name</label>
          <input name="name" placeholder="Auto from filename" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Category</label>
          <select name="category" className="ir-select">
            {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Property</label>
          <select name="propertyId" className="ir-select">
            <option value="">None</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div>
          <label className="ir-label mb-1 block">Contact</label>
          <select name="contactId" className="ir-select">
            <option value="">None</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 self-end pb-1.5 lg:col-span-2">
          <input id="confidential" name="confidential" type="checkbox" defaultChecked className="h-4 w-4 accent-ir-gold-dark" />
          <label htmlFor="confidential" className="text-sm text-ir-navy">Confidential (restricted download)</label>
        </div>
        <div className="flex items-end lg:col-span-4">
          <SubmitButton className="ir-btn ir-btn-primary ml-auto px-6" pendingText="Uploading…">Upload</SubmitButton>
        </div>
      </form>

      {documents.length === 0 ? (
        <EmptyState title="No documents uploaded yet" />
      ) : (
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium">Document</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Linked to</th>
                <th className="px-4 py-3 font-medium">Uploaded by</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => {
                const restricted = d.confidential && !showConfidential;
                return (
                  <tr key={d.id} className="border-b border-black/6 last:border-0 hover:bg-black/[0.015]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium text-ir-navy">
                        {d.confidential && <Lock size={12} className="text-black/40" />}
                        {d.name}
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge tone="gray">{titleCase(d.category)}</Badge></td>
                    <td className="px-4 py-3 text-black/60">{d.property?.title ?? (d.contact ? `${d.contact.name}` : "-")}</td>
                    <td className="px-4 py-3 text-black/60">{d.uploadedBy?.name ?? "-"}</td>
                    <td className="px-4 py-3 text-black/50">{formatDate(d.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {restricted ? (
                        <span className="text-xs text-black/30">Restricted</span>
                      ) : (
                        <a href={`/api/documents/${d.id}/download`} className="inline-flex items-center gap-1 text-xs font-medium text-ir-gold-dark hover:underline">
                          <Download size={12} /> Download
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
