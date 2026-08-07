"use client";

import { useMemo, useState } from "react";
import { PROPERTY_SUBTYPES, FEATURE_FIELDS_BY_SUBTYPE, DEFAULT_FEATURES, ALL_DISTRICTS, ALL_CITIES, districtForCity } from "@/lib/locations";
import { titleCase } from "@/lib/format";

type Owner = { id: string; name: string; phone: string };
type Agent = { id: string; name: string };

const TRANSACTION_TYPES = ["SALE", "RENT", "LEASE", "SHORT_TERM_RENTAL", "INVESTMENT", "JOINT_VENTURE", "DEVELOPMENT", "OFF_MARKET"];
const LISTING_STATUSES = ["DRAFT", "ACTIVE", "UNDER_OFFER", "RESERVED", "SOLD", "RENTED", "WITHDRAWN", "EXPIRED"];

export function PropertyForm({
  action,
  owners,
  agents,
  initial,
  submitLabel = "Create property",
}: {
  action: (formData: FormData) => void;
  owners: Owner[];
  agents: Agent[];
  initial?: Record<string, unknown>;
  submitLabel?: string;
}) {
  const [category, setCategory] = useState<string>((initial?.category as string) ?? "RESIDENTIAL");
  const [subtype, setSubtype] = useState<string>((initial?.subtype as string) ?? PROPERTY_SUBTYPES.RESIDENTIAL[0]);
  const [transactionType, setTransactionType] = useState<string>((initial?.transactionType as string) ?? "SALE");
  const [useExistingOwner, setUseExistingOwner] = useState(owners.length > 0 && Boolean(initial?.ownerId));
  const [city, setCity] = useState<string>((initial?.city as string) ?? "");
  const initialCollaboratorIds = Array.isArray(initial?.collaboratorIds) ? (initial!.collaboratorIds as string[]) : [];

  const subtypes = PROPERTY_SUBTYPES[category] ?? [];
  const featureFields = useMemo(() => Array.from(new Set([...(FEATURE_FIELDS_BY_SUBTYPE[subtype] ?? []), ...DEFAULT_FEATURES])), [subtype]);
  const initialFeatures = (initial?.featuresJson as Record<string, boolean>) ?? {};
  const district = districtForCity(city);
  // A record saved under an older/plainer city name (e.g. "Colombo 5" before
  // it became "Colombo 5 (Havelock Town)") still needs to appear as a real,
  // selectable option here, or re-saving the form without touching this
  // field would silently blank out the city.
  const cityOptions = city && !ALL_CITIES.includes(city) ? [city, ...ALL_CITIES] : ALL_CITIES;

  const isSale = transactionType === "SALE" || transactionType === "INVESTMENT" || transactionType === "OFF_MARKET" || transactionType === "JOINT_VENTURE" || transactionType === "DEVELOPMENT";
  const isRent = transactionType === "RENT" || transactionType === "SHORT_TERM_RENTAL";
  const isLease = transactionType === "LEASE";

  return (
    <form action={action} className="space-y-5">
      <Section title="Identification">
        <Grid>
          <TextField name="title" label="Property title" required defaultValue={initial?.title as string} className="sm:col-span-2" />
          <SelectField name="category" label="Category" value={category} onChange={(v) => { setCategory(v); setSubtype(PROPERTY_SUBTYPES[v]?.[0] ?? ""); }} options={Object.keys(PROPERTY_SUBTYPES).map((c) => [c, titleCase(c)])} />
          <SelectField name="subtype" label="Subtype" value={subtype} onChange={setSubtype} options={subtypes.map((s) => [s, s])} />
          <SelectField name="transactionType" label="Transaction type" value={transactionType} onChange={setTransactionType} options={TRANSACTION_TYPES.map((t) => [t, titleCase(t)])} />
          <SelectField name="listingStatus" label="Listing status" defaultValue={(initial?.listingStatus as string) ?? "DRAFT"} options={LISTING_STATUSES.map((s) => [s, titleCase(s)])} />
          <SelectField name="exclusivity" label="Exclusivity" defaultValue={(initial?.exclusivity as string) ?? "OPEN"} options={[["EXCLUSIVE", "Exclusive"], ["OPEN", "Open listing"]]} />
          <TextField name="source" label="Source of listing" defaultValue={initial?.source as string} placeholder="Referral, WhatsApp, ikman.lk…" />
          <SelectField name="assignedAgentId" label="Assigned agent" defaultValue={initial?.assignedAgentId as string} options={agents.map((a) => [a.id, a.name])} />
          <TextField name="expiryDate" label="Listing expiry date" type="date" defaultValue={initial?.expiryDate as string} />
        </Grid>
        <TextAreaField name="description" label="Description" defaultValue={initial?.description as string} rows={3} />
        <div>
          <label className="ir-label mb-1.5 block">Collaborating agents</label>
          <p className="mb-2 text-[0.7rem] text-black/40">Sometimes more than one agent works a listing. Added here, they show up on this property everywhere it&rsquo;s referenced.</p>
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

      <Section title="Location">
        <Grid>
          <SelectField name="city" label="City / suburb" value={city} onChange={setCity} options={[["", "Select…"], ...cityOptions.map((c) => [c, c] as [string, string])]} />
          <TextField name="district" label="District" value={district ?? (initial?.district as string) ?? ""} readOnly options={ALL_DISTRICTS} />
          <TextField name="address" label="Full address" defaultValue={initial?.address as string} className="sm:col-span-2" />
          <TextField name="landmark" label="Landmark" defaultValue={initial?.landmark as string} />
          <SelectField name="locationVisibility" label="Location visibility" defaultValue={(initial?.locationVisibility as string) ?? "APPROXIMATE"} options={[["EXACT", "Exact pin"], ["APPROXIMATE", "Approximate area"], ["HIDDEN", "Hidden"]]} />
          <TextField name="lat" label="Latitude" type="number" step="any" defaultValue={initial?.lat as number} />
          <TextField name="lng" label="Longitude" type="number" step="any" defaultValue={initial?.lng as number} />
          <TextField name="roadAccess" label="Road access" defaultValue={initial?.roadAccess as string} />
          <TextField name="roadWidthFt" label="Road width (ft)" type="number" defaultValue={initial?.roadWidthFt as number} />
          <TextField name="distanceMajorRoadKm" label="Distance to major road (km)" type="number" step="0.1" defaultValue={initial?.distanceMajorRoadKm as number} />
        </Grid>
      </Section>

      <Section title="Measurements">
        <Grid>
          <TextField name="sizePerches" label="Size (perches)" type="number" step="0.1" defaultValue={initial?.sizePerches as number} />
          <TextField name="sizeAcres" label="Size (acres)" type="number" step="0.01" defaultValue={initial?.sizeAcres as number} />
          <TextField name="sizeSqft" label="Size (sqft)" type="number" defaultValue={initial?.sizeSqft as number} />
          <TextField name="builtUpSqft" label="Built-up area (sqft)" type="number" defaultValue={initial?.builtUpSqft as number} />
          {category === "INDUSTRIAL_LOGISTICS" && <TextField name="warehouseFloorSqft" label="Warehouse floor area (sqft)" type="number" defaultValue={initial?.warehouseFloorSqft as number} />}
          {category === "INDUSTRIAL_LOGISTICS" && <TextField name="clearHeightFt" label="Clear height (ft)" type="number" defaultValue={initial?.clearHeightFt as number} />}
          <TextField name="frontageFt" label="Frontage (ft)" type="number" defaultValue={initial?.frontageFt as number} />
          <TextField name="buildingHeightFt" label="Building height (ft)" type="number" defaultValue={initial?.buildingHeightFt as number} />
          <TextField name="floors" label="Number of floors" type="number" defaultValue={initial?.floors as number} />
          {category === "RESIDENTIAL" && <TextField name="bedrooms" label="Bedrooms" type="number" defaultValue={initial?.bedrooms as number} />}
          {category === "RESIDENTIAL" && <TextField name="bathrooms" label="Bathrooms" type="number" defaultValue={initial?.bathrooms as number} />}
        </Grid>
      </Section>

      <Section title="Pricing">
        <Grid>
          {isSale && <TextField name="totalPrice" label="Total asking price (LKR)" type="number" defaultValue={initial?.totalPrice as number} />}
          {isSale && <TextField name="pricePerPerch" label="Price per perch" type="number" defaultValue={initial?.pricePerPerch as number} />}
          {isSale && <TextField name="pricePerSqft" label="Price per sqft" type="number" defaultValue={initial?.pricePerSqft as number} />}
          {isRent && <TextField name="monthlyRental" label="Monthly rental (LKR)" type="number" defaultValue={initial?.monthlyRental as number} />}
          {isRent && <TextField name="securityDeposit" label="Security deposit" type="number" defaultValue={initial?.securityDeposit as number} />}
          {isLease && <TextField name="annualLeaseValue" label="Annual lease value (LKR)" type="number" defaultValue={initial?.annualLeaseValue as number} />}
          {isLease && <TextField name="keyMoney" label="Key money" type="number" defaultValue={initial?.keyMoney as number} />}
          {(isRent || isLease) && <TextField name="minLeaseTermMonths" label="Minimum lease term (months)" type="number" defaultValue={initial?.minLeaseTermMonths as number} />}
          <TextField name="expectedYieldPct" label="Expected yield (%)" type="number" step="0.1" defaultValue={initial?.expectedYieldPct as number} />
          <SelectField name="currency" label="Currency" defaultValue={(initial?.currency as string) ?? "LKR"} options={[["LKR", "LKR"], ["USD", "USD"]]} />
          <TextField name="ownerMinPrice" label="Owner's confidential minimum" type="number" defaultValue={initial?.ownerMinPrice as number} hint="Visible only to confidential-access roles" />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ir-navy">
            <input type="checkbox" name="priceNegotiable" defaultChecked={(initial?.priceNegotiable as boolean) ?? true} className="h-4 w-4 accent-ir-gold-dark" />
            Price negotiable
          </label>
        </Grid>
      </Section>

      <Section title="Features">
        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {featureFields.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-ir-navy">
              <input type="checkbox" name="features" value={f} defaultChecked={Boolean(initialFeatures[f])} className="h-4 w-4 accent-ir-gold-dark" />
              {titleCase(f)}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Owner">
        {owners.length > 0 && (
          <div className="mb-3 flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={useExistingOwner} onChange={() => setUseExistingOwner(true)} className="accent-ir-gold-dark" /> Existing contact
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={!useExistingOwner} onChange={() => setUseExistingOwner(false)} className="accent-ir-gold-dark" /> New owner
            </label>
          </div>
        )}
        <Grid>
          {useExistingOwner ? (
            <SelectField
              name="ownerId"
              label="Owner"
              defaultValue={initial?.ownerId as string}
              options={[["", "Select owner…"], ...owners.map((o) => [o.id, `${o.name} · ${o.phone}`] as [string, string])]}
            />
          ) : (
            <>
              <TextField name="ownerNewName" label="Owner name" />
              <TextField name="ownerNewPhone" label="Owner phone" placeholder="+9477…" />
            </>
          )}
        </Grid>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2.5">
          <Checkbox name="ownerAuthorityConfirmed" label="Owner authority confirmed" defaultChecked={initial?.ownerAuthorityConfirmed as boolean} />
          <Checkbox name="deedAvailable" label="Deed available" defaultChecked={initial?.deedAvailable as boolean} />
          <Checkbox name="surveyPlanAvailable" label="Survey plan available" defaultChecked={initial?.surveyPlanAvailable as boolean} />
          <Checkbox name="cocAvailable" label="COC available" defaultChecked={initial?.cocAvailable as boolean} />
          <Checkbox name="approvedPlanAvailable" label="Approved building plan" defaultChecked={initial?.approvedPlanAvailable as boolean} />
          <Checkbox name="municipalDocsAvailable" label="Municipal documents" defaultChecked={initial?.municipalDocsAvailable as boolean} />
          <Checkbox name="taxDocsAvailable" label="Tax / rates documents" defaultChecked={initial?.taxDocsAvailable as boolean} />
        </div>
        <Grid className="mt-3">
          <TextField name="mortgageStatus" label="Mortgage status" defaultValue={initial?.mortgageStatus as string} />
          <SelectField name="legalVerificationStatus" label="Legal verification status" defaultValue={(initial?.legalVerificationStatus as string) ?? "UNVERIFIED"} options={[["UNVERIFIED", "Unverified"], ["IN_PROGRESS", "In progress"], ["VERIFIED", "Verified"], ["ISSUES_FOUND", "Issues found"]]} />
        </Grid>
        <TextAreaField name="internalLegalNotes" label="Internal legal notes (confidential)" defaultValue={initial?.internalLegalNotes as string} rows={2} />
      </Section>

      <Section title="Media">
        <Grid>
          <TextField name="heroImageUrl" label="Hero image URL" defaultValue={(initial?.heroImageUrl as string) ?? "/brand/logo-icon-gold.png"} className="sm:col-span-2" hint="Phase 1 uses external URLs / placeholders. Direct upload ships with the Document Vault." />
        </Grid>
      </Section>

      <div className="flex justify-end gap-2 pt-2">
        <button type="submit" className="ir-btn ir-btn-primary px-6 py-2.5">
          {submitLabel}
        </button>
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

function TextField({
  name,
  label,
  type = "text",
  required,
  defaultValue,
  value,
  onChange,
  placeholder,
  step,
  readOnly,
  className = "",
  hint,
  options,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  step?: string;
  readOnly?: boolean;
  className?: string;
  hint?: string;
  options?: string[]; // datalist suggestions
}) {
  const listId = options ? `${name}-list` : undefined;
  return (
    <div className={className}>
      <label className="ir-label mb-1 block">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        readOnly={readOnly}
        placeholder={placeholder}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        list={listId}
        className="ir-input"
      />
      {options && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {hint && <div className="mt-1 text-[0.7rem] text-black/40">{hint}</div>}
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

function SelectField({
  name,
  label,
  value,
  defaultValue,
  onChange,
  options,
}: {
  name: string;
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="ir-label mb-1 block">{label}</label>
      <select
        name={name}
        value={value}
        defaultValue={value === undefined ? defaultValue : undefined}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        className="ir-select"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Checkbox({ name, label, defaultChecked }: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ir-navy">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="h-4 w-4 accent-ir-gold-dark" />
      {label}
    </label>
  );
}
