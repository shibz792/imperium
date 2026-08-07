"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const GOLD = "#cca274";
const NAVY = "#091526";

export function FunnelChart({ data }: { data: { stage: string; count: number }[] }) {
  const formatted = data.map((d) => ({ ...d, label: d.stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={formatted} layout="vertical" margin={{ left: 12, right: 24, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="rgba(9,21,38,0.08)" />
        <XAxis type="number" tick={{ fontSize: 11, fill: "rgba(9,21,38,0.5)" }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11, fill: "rgba(9,21,38,0.65)" }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: "rgba(9,21,38,0.04)" }}
          contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid rgba(9,21,38,0.1)" }}
        />
        <Bar dataKey="count" fill={NAVY} radius={[0, 3, 3, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AgentPerformanceChart({ data }: { data: { name: string; dealsOpen: number; dealsWon: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ left: 0, right: 12, top: 4, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="rgba(9,21,38,0.08)" />
        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "rgba(9,21,38,0.55)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: "rgba(9,21,38,0.5)" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(9,21,38,0.04)" }} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid rgba(9,21,38,0.1)" }} />
        <Bar dataKey="dealsOpen" name="Open deals" fill="rgba(9,21,38,0.35)" radius={[3, 3, 0, 0]} barSize={18} />
        <Bar dataKey="dealsWon" name="Closed won" fill={GOLD} radius={[3, 3, 0, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
