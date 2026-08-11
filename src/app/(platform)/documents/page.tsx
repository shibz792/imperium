import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { canSeeConfidential, isAdmin, requireRole } from "@/lib/auth";
import { DOCUMENT_ROLES } from "@/lib/roles";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatDate, titleCase } from "@/lib/format";
import { uploadDocument, importDocumentsFromDrive } from "./actions";
import { GoogleDriveBrowser } from "@/components/GoogleDriveBrowser";
import { SubmitButton } from "@/components/SubmitButton";
import { Pagination } from "@/components/Pagination";
import { paginationParams, totalPages as computeTotalPages } from "@/lib/pagination";
import { SelectionProvider } from "@/components/selection/SelectionContext";
import { RowCheckbox } from "@/components/selection/RowCheckbox";
import { SelectAllCheckbox } from "@/components/selection/SelectAllCheckbox";
import { DocumentsBulkActions, type DocumentExportRow } from "./DocumentsBulkActions";
import { Lock, Download } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";

const CATEGORIES = ["DEED", "SURVEY_PLAN", "COC", "APPROVED_PLAN", "MUNICIPAL", "TAX", "AGREEMENT", "IDENTIFICATION", "OTHER"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole(DOCUMENT_ROLES);
  const showConfidential = canSeeConfidential(user);
  const sp = await searchParams;

  // Previously fetched every document unconditionally — no filter, no
  // pagination. Bulk-select's page-scoped selection model assumes a
  // bounded row set like every other list page already has, so this
  // brings Documents up to the same shape as contacts/page.tsx.
  const where: Prisma.DocumentWhereInput = {};
  if (sp.category) where.category = sp.category as never;
  if (sp.q) {
    where.OR = [
      { name: { contains: sp.q } },
      { property: { title: { contains: sp.q } } },
      { contact: { name: { contains: sp.q } } },
    ];
  }

  const { page, skip, take } = paginationParams(sp);
  const [documents, total, properties, contacts] = await Promise.all([
    prisma.document.findMany({ where, include: { property: true, contact: true, uploadedBy: true }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.document.count({ where }),
    prisma.property.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } }),
    prisma.contact.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const pages = computeTotalPages(total);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();

  // Pre-redacted for CSV export — no internal storage key, no raw download
  // link (downloads must keep going through the gated, audited route).
  const exportRows: DocumentExportRow[] = documents.map((d) => ({
    id: d.id,
    name: d.name,
    category: titleCase(d.category),
    confidential: d.confidential ? "Yes" : "No",
    linkedTo: d.property?.title ?? d.contact?.name ?? "",
    uploadedBy: d.uploadedBy?.name ?? "",
    date: formatDate(d.createdAt),
  }));

  return (
    <div>
      <PageHeader
        eyebrow={`Document Vault · ${total}`}
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

      <form className="ir-card mb-5 flex flex-wrap items-end gap-3 p-4" method="GET">
        <div className="min-w-[200px] flex-1">
          <label className="ir-label mb-1 block">Search</label>
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Name, property, contact…" className="ir-input" />
        </div>
        <div>
          <label className="ir-label mb-1 block">Category</label>
          <select name="category" defaultValue={sp.category ?? ""} className="ir-select">
            <option value="">All</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{titleCase(c)}</option>)}
          </select>
        </div>
        <button type="submit" className="ir-btn ir-btn-ghost">Filter</button>
        {(sp.q || sp.category) && (
          <Link href="/documents" className="text-xs text-black/40 hover:text-ir-navy">Clear</Link>
        )}
      </form>

      {documents.length === 0 ? (
        <EmptyState title="No documents match these filters" />
      ) : (
        <SelectionProvider ids={documents.map((d) => d.id)} key={`${page}-${qs}`}>
        <DocumentsBulkActions rows={exportRows} canDelete={isAdmin(user)} />
        <div className="ir-card overflow-x-auto">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/8 text-[0.7rem] uppercase tracking-wide text-black/40">
                <th className="px-4 py-3 font-medium"><SelectAllCheckbox /></th>
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
                    <td className="px-4 py-3"><RowCheckbox id={d.id} /></td>
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
        </SelectionProvider>
      )}

      <Pagination page={page} totalPages={pages} total={total} basePath="/documents" searchParams={sp} />
    </div>
  );
}
