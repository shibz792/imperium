"use client";

import { useState } from "react";
import { ALL_CITIES, ALL_DISTRICTS } from "@/lib/locations";
import { titleCase } from "@/lib/format";

type Agent = { id: string; name: string };

// Deliberately minimal: real intake here is "name, number, and are they the
// owner / a company / representing someone else" — not a full contact
// record. Everything past that is optional and hidden behind "More details"
// rather than demanded up front. Broker is the one exception: an external
// co-broking partner is usually an agency, so its name matters as much as
// the person's — surfaced up front instead of buried behind the fold.
export function ContactForm({
  action,
  agents,
  initial,
  submitLabel = "Save contact",
}: {
  action: (formData: FormData) => void;
  agents: Agent[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
}) {
  const [contactType, setContactType] = useState((initial?.contactType as string) ?? "BUYER");
  const isBroker = contactType === "BROKER";

  return (
    <form action={action} className="ir-card space-y-4 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required autoFocus defaultValue={initial?.name as string} placeholder="Adam" className="ir-input" />
        </Field>
        <Field label="Phone / WhatsApp number">
          <input name="phone" required defaultValue={initial?.phone as string} placeholder="+9477…" className="ir-input" />
        </Field>
        <Field label="Type">
          <select name="contactType" value={contactType} onChange={(e) => setContactType(e.target.value)} className="ir-select">
            {["OWNER", "BUYER", "TENANT", "BROKER", "DEVELOPER", "INVESTOR", "CORPORATE"].map((t) => (
              <option key={t} value={t}>{t === "BROKER" ? "Broker / Agency" : titleCase(t)}</option>
            ))}
          </select>
        </Field>
        <Field label="Are they the owner, a company, or representing someone else?">
          <select name="capacity" defaultValue={(initial?.capacity as string) ?? "INDIVIDUAL"} className="ir-select">
            <option value="INDIVIDUAL">Owner / individual, direct</option>
            <option value="COMPANY">Company</option>
            <option value="REPRESENTATIVE">Representative (agent, family member, etc.)</option>
          </select>
        </Field>
        {isBroker && (
          <Field label="Agency / company name (leave blank if an independent broker)" className="sm:col-span-2">
            <input name="companyName" defaultValue={initial?.companyName as string} placeholder="e.g. Lanka Prime Properties" className="ir-input" />
          </Field>
        )}
      </div>

      <details className="group" open={isBroker}>
        <summary className="cursor-pointer list-none text-xs font-medium text-ir-gold-dark hover:underline">
          <span className="group-open:hidden">+ Add more details (optional)</span>
          <span className="hidden group-open:inline">− Hide extra details</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-black/6 pt-3 sm:grid-cols-2">
          <Field label="WhatsApp (if different)">
            <input name="whatsapp" defaultValue={initial?.whatsapp as string} placeholder="+9477…" className="ir-input" />
          </Field>
          <Field label="Email">
            <input name="email" type="email" defaultValue={initial?.email as string} className="ir-input" />
          </Field>
          {!isBroker && (
            <Field label="Company name">
              <input name="companyName" defaultValue={initial?.companyName as string} className="ir-input" />
            </Field>
          )}
          <Field label="Source">
            <input name="source" defaultValue={initial?.source as string} placeholder="Referral, WhatsApp, Facebook…" className="ir-input" />
          </Field>
          <Field label="City">
            <input name="city" list="city-list" defaultValue={initial?.city as string} className="ir-input" />
            <datalist id="city-list">{ALL_CITIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
          <Field label="District">
            <input name="district" list="district-list" defaultValue={initial?.district as string} className="ir-input" />
            <datalist id="district-list">{ALL_DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field label="Address">
            <input name="address" defaultValue={initial?.address as string} className="ir-input" />
          </Field>
          <Field label="Assigned agent">
            <select name="assignedAgentId" defaultValue={initial?.assignedAgentId as string} className="ir-select">
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea name="notes" rows={2} defaultValue={initial?.notes as string} className="ir-input" />
          </Field>
          <Field label="Confidential notes" className="sm:col-span-2">
            <textarea name="confidentialNotes" rows={2} defaultValue={initial?.confidentialNotes as string} className="ir-input" />
          </Field>
        </div>
      </details>

      <div className="flex justify-end pt-2">
        <button type="submit" className="ir-btn ir-btn-primary px-6 py-2.5">{submitLabel}</button>
      </div>
    </form>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="ir-label mb-1 block">{label}</label>
      {children}
    </div>
  );
}
