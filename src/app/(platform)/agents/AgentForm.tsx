"use client";

import { useState } from "react";
import { ALL_DISTRICTS } from "@/lib/locations";
import { SubmitButton } from "@/components/SubmitButton";

export function AgentForm({
  action,
  initial,
  submitLabel = "Add agent",
  isNew = false,
}: {
  action: (formData: FormData) => void;
  initial?: Record<string, unknown>;
  submitLabel?: string;
  isNew?: boolean;
}) {
  const territory = Array.isArray(initial?.territoryJson) ? (initial!.territoryJson as string[]) : [];
  const [rateType, setRateType] = useState((initial?.commissionRateType as string) ?? "PERCENT");

  return (
    <form action={action} className="ir-card space-y-3 p-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <input name="name" required defaultValue={initial?.name as string} className="ir-input" />
        </Field>
        <Field label="Job title">
          <input name="title" placeholder="Senior Property Consultant" defaultValue={initial?.title as string} className="ir-input" />
        </Field>
        {isNew && (
          <Field label="Email">
            <input name="email" type="email" required className="ir-input" />
          </Field>
        )}
        <Field label="Phone">
          <input name="phone" placeholder="+9477…" defaultValue={initial?.phone as string} className="ir-input" />
        </Field>
        {isNew && (
          <>
            <Field label="Role">
              <select name="role" defaultValue="AGENT" className="ir-select">
                <option value="AGENT">Property Agent</option>
                <option value="SALES_MANAGER">Sales Manager</option>
                <option value="DIRECTOR">Director</option>
              </select>
            </Field>
            <Field label="Password">
              <input name="password" placeholder="Imperium@123" className="ir-input" />
            </Field>
          </>
        )}
        <Field label="Territory / districts covered (comma separated)" className="sm:col-span-2">
          <input name="territory" defaultValue={territory.join(", ")} list="district-list" className="ir-input" placeholder="Colombo, Gampaha…" />
          <datalist id="district-list">{ALL_DISTRICTS.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
      </div>

      <div className="rounded border border-black/8 bg-ir-ivory/40 p-3.5">
        <div className="ir-label mb-2.5">Commission split</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="How this agent is paid">
            <select name="commissionRateType" value={rateType} onChange={(e) => setRateType(e.target.value)} className="ir-select">
              <option value="PERCENT">% of the agency fee</option>
              <option value="FIXED">Flat amount per deal</option>
            </select>
          </Field>
          <Field label={rateType === "FIXED" ? "Flat amount (LKR)" : "Percentage of agency fee"}>
            <input
              name="commissionRate"
              type="number"
              min={0}
              step={rateType === "FIXED" ? 1000 : 1}
              defaultValue={initial?.commissionRate as number | undefined}
              placeholder={rateType === "FIXED" ? "e.g. 150000" : "Defaults to 50%"}
              className="ir-input"
            />
          </Field>
        </div>
        <p className="mt-2 text-[0.7rem] text-black/40">Used to split the agency fee automatically when a deal this agent&apos;s assigned to closes won. Leave the rate blank for the company default (50%).</p>
      </div>

      <Field label="Bio">
        <textarea name="bio" rows={3} defaultValue={initial?.bio as string} className="ir-input" placeholder="A short introduction shown on this agent's public profile." />
      </Field>
      <div className="flex justify-end pt-2">
        <SubmitButton className="ir-btn ir-btn-primary px-6 py-2.5">{submitLabel}</SubmitButton>
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
