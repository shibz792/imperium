"use client";

import { useState } from "react";
import { MatchedAudiencePanel } from "./MatchedAudiencePanel";

type PropertyOption = { id: string; title: string; propertyRef: string };

// Its own property picker rather than sharing state with the Create tab —
// Distribute is addressable standalone now (you don't have to generate
// something first to get here), matching the Publish and Ads tabs.
export function DistributePanel({ properties, cloudConfigured, emailConfigured }: { properties: PropertyOption[]; cloudConfigured: boolean; emailConfigured: boolean }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");

  return (
    <div>
      <div className="ir-card p-5">
        <label className="ir-label mb-1 block">Property</label>
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="ir-select">
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      {propertyId && <MatchedAudiencePanel key={propertyId} propertyId={propertyId} cloudConfigured={cloudConfigured} emailConfigured={emailConfigured} />}
    </div>
  );
}
