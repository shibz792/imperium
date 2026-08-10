"use client";

import { useState } from "react";

// Sri Lanka first since that's the overwhelming majority of contacts here,
// but this is a real estate CRM in a country with plenty of overseas
// owners/buyers/investors — the country code needs to be changeable, not
// just implied by a "+9477…" placeholder someone has to remember to type
// over.
const COUNTRY_CODES = [
  { code: "+94", label: "🇱🇰 +94 Sri Lanka" },
  { code: "+91", label: "🇮🇳 +91 India" },
  { code: "+44", label: "🇬🇧 +44 UK" },
  { code: "+1", label: "🇺🇸 +1 US / Canada" },
  { code: "+61", label: "🇦🇺 +61 Australia" },
  { code: "+971", label: "🇦🇪 +971 UAE" },
  { code: "+65", label: "🇸🇬 +65 Singapore" },
  { code: "+974", label: "🇶🇦 +974 Qatar" },
  { code: "+966", label: "🇸🇦 +966 Saudi Arabia" },
  { code: "+973", label: "🇧🇭 +973 Bahrain" },
  { code: "+49", label: "🇩🇪 +49 Germany" },
  { code: "+33", label: "🇫🇷 +33 France" },
  { code: "+86", label: "🇨🇳 +86 China" },
  { code: "+81", label: "🇯🇵 +81 Japan" },
] as const;

function splitPhone(value?: string): { code: string; rest: string } {
  const v = (value ?? "").trim();
  if (!v) return { code: "+94", rest: "" };
  const known = COUNTRY_CODES.find((c) => v.startsWith(c.code));
  if (known) return { code: known.code, rest: v.slice(known.code.length).trim() };
  if (v.startsWith("+")) return { code: "OTHER", rest: v }; // a country code not in the shortlist — keep it editable as-is rather than mangling it
  if (v.startsWith("0")) return { code: "+94", rest: v.slice(1) }; // local Sri Lankan format, e.g. "0771234567"
  return { code: "+94", rest: v };
}

export function PhoneField({
  name,
  label,
  defaultValue,
  required,
  className = "",
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
}) {
  const initial = splitPhone(defaultValue);
  const [code, setCode] = useState(initial.code);
  const [rest, setRest] = useState(initial.rest);
  const combined = code === "OTHER" ? rest.trim() : `${code}${rest.replace(/\D/g, "")}`;

  return (
    <div className={className}>
      {label && <label className="ir-label mb-1 block">{label}</label>}
      <div className="flex gap-1.5">
        <select value={code} onChange={(e) => setCode(e.target.value)} className="ir-select !w-[92px] shrink-0 !px-1.5 !text-xs" title="Country code">
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>{c.code}</option>
          ))}
          <option value="OTHER">Other</option>
        </select>
        <input
          type="tel"
          value={rest}
          onChange={(e) => setRest(e.target.value)}
          placeholder={code === "OTHER" ? "+00 …" : "77 123 4567"}
          required={required}
          className="ir-input flex-1"
        />
      </div>
      <input type="hidden" name={name} value={combined} />
    </div>
  );
}
