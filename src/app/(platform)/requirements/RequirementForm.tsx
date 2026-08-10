"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import { PhoneField } from "@/components/PhoneField";
import { PROPERTY_SUBTYPES, FEATURE_FIELDS_BY_SUBTYPE, DEFAULT_FEATURES, ALL_CITIES, ALL_DISTRICTS } from "@/lib/locations";
import { titleCase } from "@/lib/format";

type ClientOption = { id: string; name: string; phone: string };
type Agent = { id: string; name: string };

const REQUIREMENT_TYPES = ["BUYER", "TENANT", "CORPORATE_LEASE", "INVESTOR_MANDATE", "DEVELOPER_LAND", "WAREHOUSE", "HOSPITALITY", "RELOCATION", "SELLER_VALUATION", "OWNER_SEEKING_TENANT"];
const STATUSES = ["NEW", "UNVERIFIED", "QUALIFIED", "ACTIVELY_SEARCHING", "OPTIONS_SHARED", "VIEWING_ARRANGED", "NEGOTIATING", "ON_HOLD", "COMPLETED", "LOST_EXPIRED"];

export function RequirementForm({
  action,
  clients,
  agents,
  initial,
  submitLabel = "Create requirement",
}: {
  action: (formData: FormData) => void;
  clients: ClientOption[];
  agents: Agent[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
}) {
  const [category, setCategory] = useState<string>((initial?.category as string) ?? "RESIDENTIAL");
  const [subtype, setSubtype] = useState<string>((initial?.subtype as string) ?? "");
  const [useExisting, setUseExisting] = useState(clients.length > 0 && Boolean(initial?.clientId));
  const initialLocations = Array.isArray(initial?.preferredLocationsJson) ? (initial!.preferredLocationsJson as string[]) : [];
  const initialSurrounding = Array.isArray(initial?.acceptableSurroundingJson) ? (initial!.acceptableSurroundingJson as string[]) : [];
  const initialFeatures = (initial?.requiredFeaturesJson as Record<string, boolean>) ?? {};
  const initialCollaboratorIds = Array.isArray(initial?.collaboratorIds) ? (initial!.collaboratorIds as string[]) : [];

  const featureFields = useMemo(() => Array.from(new Set([...(FEATURE_FIELDS_BY_SUBTYPE[subtype] ?? []), ...DEFAULT_FEATURES])), [subtype]);

  return (
    <form action={action} className="space-y-5">
      <Section title="Client">
        {clients.length > 0 && (
          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} className="accent-ir-gold-dark" /> Existing contact
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} className="accent-ir-gold-dark" /> New client
            </label>
          </div>
        )}
        <Grid>
          {useExisting ? (
            <SelectField name="clientId" label="Client" defaultValue={initial?.clientId as string} options={[["", "Select client…"], ...clients.map((c) => [c.id, `${c.name} · ${c.phone}`] as [string, string])]} />
          ) : (
            <>
              <TextField name="clientNewName" label="Client name" />
              <PhoneField name="clientNewPhone" label="Client phone" />
              <SelectField name="clientContactType" label="Contact type" defaultValue="BUYER" options={[["BUYER", "Buyer"], ["TENANT", "Tenant"]]} />
            </>
          )}
          <TextField name="companyName" label="Company (if corporate)" defaultValue={initial?.companyName as string} />
          <TextField name="decisionMaker" label="Decision maker" defaultValue={initial?.decisionMaker as string} />
        </Grid>
      </Section>

      <Section title="Requirement">
        <Grid>
          <TextField name="title" label="Requirement title" required defaultValue={initial?.title as string} className="sm:col-span-2" />
          <SelectField name="type" label="Requirement type" defaultValue={(initial?.type as string) ?? "BUYER"} options={REQUIREMENT_TYPES.map((t) => [t, titleCase(t)])} />
          <SelectField name="dealType" label="Buy / rent / lease" defaultValue={(initial?.dealType as string) ?? "BUY"} options={[["BUY", "Buy"], ["RENT", "Rent"], ["LEASE", "Lease"]]} />
          <SelectField name="category" label="Property type" value={category} onChange={(v) => { setCategory(v); setSubtype(""); }} options={Object.keys(PROPERTY_SUBTYPES).map((c) => [c, titleCase(c)])} />
          <SelectField name="subtype" label="Subtype" value={subtype} onChange={setSubtype} options={[["", "Any"], ...(PROPERTY_SUBTYPES[category] ?? []).map((s) => [s, s] as [string, string])]} />
          <TextField name="intendedUse" label="Intended use" defaultValue={initial?.intendedUse as string} />
          <TextField name="deadline" label="Move-in / purchase deadline" type="date" defaultValue={initial?.deadline as string} />
        </Grid>
      </Section>

      <Section title="Location & budget">
        <Grid>
          <TextField name="preferredLocations" label="Preferred locations (comma separated)" defaultValue={initialLocations.join(", ")} className="sm:col-span-2" options={[...ALL_CITIES, ...ALL_DISTRICTS]} />
          <TextField name="acceptableSurrounding" label="Acceptable surrounding areas" defaultValue={initialSurrounding.join(", ")} className="sm:col-span-2" options={[...ALL_CITIES, ...ALL_DISTRICTS]} />
          <TextField name="budgetMin" label="Minimum budget" type="number" defaultValue={initial?.budgetMin as number} />
          <TextField name="budgetMax" label="Maximum budget" type="number" defaultValue={initial?.budgetMax as number} />
          <TextField name="sizeMin" label="Minimum size (sqft)" type="number" defaultValue={initial?.sizeMin as number} />
          <TextField name="sizeMax" label="Maximum size (sqft)" type="number" defaultValue={initial?.sizeMax as number} />
        </Grid>
      </Section>

      <Section title="Required features">
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {featureFields.length === 0 && <p className="text-xs text-black/40">Select a subtype to see relevant features.</p>}
          {featureFields.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-ir-navy">
              <input type="checkbox" name="requiredFeatures" value={f} defaultChecked={Boolean(initialFeatures[f])} className="h-4 w-4 accent-ir-gold-dark" />
              {titleCase(f)}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Qualification & follow-up">
        <Grid>
          <SelectField name="financingStatus" label="Financing status" defaultValue={(initial?.financingStatus as string) ?? "UNCONFIRMED"} options={[["CASH", "Cash"], ["BANK_FINANCE", "Bank finance"], ["UNCONFIRMED", "Unconfirmed"]]} />
          <TextField name="decisionStage" label="Decision stage" defaultValue={initial?.decisionStage as string} />
          <SelectField name="urgency" label="Urgency" defaultValue={(initial?.urgency as string) ?? "MEDIUM"} options={[["LOW", "Low"], ["MEDIUM", "Medium"], ["HIGH", "High"], ["CRITICAL", "Critical"]]} />
          <SelectField name="quality" label="Requirement quality" defaultValue={(initial?.quality as string) ?? "UNVERIFIED"} options={[["UNVERIFIED", "Unverified"], ["QUALIFIED", "Qualified"], ["PREMIUM", "Premium"]]} />
          <SelectField name="status" label="Status" defaultValue={(initial?.status as string) ?? "NEW"} options={STATUSES.map((s) => [s, titleCase(s)])} />
          <SelectField name="assignedAgentId" label="Assigned agent" defaultValue={initial?.assignedAgentId as string} options={agents.map((a) => [a.id, a.name])} />
          <TextField name="source" label="Source" defaultValue={initial?.source as string} />
          <TextField name="nextAction" label="Next action" defaultValue={initial?.nextAction as string} />
          <TextField name="nextActionDate" label="Next action date" type="date" defaultValue={initial?.nextActionDate as string} />
          <TextField name="expiryDate" label="Requirement expiry date" type="date" defaultValue={initial?.expiryDate as string} />
        </Grid>
        <TextAreaField name="confidentialNotes" label="Confidential notes" defaultValue={initial?.confidentialNotes as string} rows={2} />
        <div>
          <label className="ir-label mb-1.5 block">Collaborating agents</label>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm text-ir-navy">
                <input type="checkbox" name="collaboratorIds" value={a.id} defaultChecked={initialCollaboratorIds.includes(a.id)} className="h-4 w-4 accent-ir-gold-dark" />
                {a.name}
              </label>
            ))}
          </div>
        </div>
      </Section>

      <div className="flex justify-end gap-2 pt-2">
        <SubmitButton className="ir-btn ir-btn-primary px-6 py-2.5">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="ir-card p-5">
      <legend className="ir-label px-1">{title}</legend>
      <div className="mt-2 space-y-3">{children}</div>
    </fieldset>
  );
}
function Grid({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>{children}</div>;
}
function TextField({ name, label, type = "text", required, defaultValue, value, onChange, placeholder, className = "", options }: { name: string; label: string; type?: string; required?: boolean; defaultValue?: string | number; value?: string; onChange?: (v: string) => void; placeholder?: string; className?: string; options?: string[] }) {
  const listId = options ? `${name}-list` : undefined;
  return (
    <div className={className}>
      <label className="ir-label mb-1 block">{label}</label>
      <input name={name} type={type} required={required} placeholder={placeholder} defaultValue={value === undefined ? defaultValue : undefined} value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} list={listId} className="ir-input" />
      {options && <datalist id={listId}>{Array.from(new Set(options)).map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  );
}
function TextAreaField({ name, label, defaultValue, rows = 3 }: { name: string; label: string; defaultValue?: string; rows?: number }) {
  return (
    <div>
      <label className="ir-label mb-1 block">{label}</label>
      <textarea name={name} rows={rows} defaultValue={defaultValue} className="ir-input" />
    </div>
  );
}
function SelectField({ name, label, value, defaultValue, onChange, options }: { name: string; label: string; value?: string; defaultValue?: string; onChange?: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <label className="ir-label mb-1 block">{label}</label>
      <select name={name} value={value} defaultValue={value === undefined ? defaultValue : undefined} onChange={onChange ? (e) => onChange(e.target.value) : undefined} className="ir-select">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
