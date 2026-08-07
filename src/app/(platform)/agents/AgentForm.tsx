"use client";

import { ALL_DISTRICTS } from "@/lib/locations";

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
      <Field label="Bio">
        <textarea name="bio" rows={3} defaultValue={initial?.bio as string} className="ir-input" placeholder="A short introduction shown on this agent's public profile." />
      </Field>
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
