import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string | null;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-2xl">
        {eyebrow && (
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="ir-label !mb-0">{eyebrow}</div>
            <div className="ir-rule-gold h-px flex-1" />
          </div>
        )}
        <h1 className="ir-editorial text-[2rem] leading-[1.1] text-ir-navy sm:text-[2.25rem]">{title}</h1>
        {description && <p className="mt-2 text-sm leading-relaxed text-black/55">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "gold" | "warn" | "good";
}) {
  return (
    <div className="ir-card ir-card-hover p-4">
      <div className="ir-label mb-2.5">{label}</div>
      <div
        className={clsx(
          "ir-figure text-[1.6rem] leading-none",
          tone === "gold" && "text-ir-gold-dark",
          tone === "warn" && "text-[color:var(--color-bronze)]",
          tone === "good" && "text-[color:var(--color-forest)]",
          tone === "default" && "text-ir-navy",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[0.7rem] text-black/40">{hint}</div>}
    </div>
  );
}

// NOTE: Tailwind v4 arbitrary `[color:var(--x)]` values combined with an
// opacity modifier (e.g. `/30`) silently resolve to a transparent border —
// verified by inspecting computed styles, not just eyeballing a screenshot.
// Hardcoded 8-digit hex (color + baked-in alpha) sidesteps that entirely.
const BADGE_TONES: Record<string, string> = {
  navy: "border-[#09152640] bg-[#0915260d] text-ir-navy",
  gold: "border-[#a97f5659] bg-[#cca27424] text-ir-gold-dark",
  green: "border-[#3f6c514d] bg-[color:var(--color-forest-tint)] text-[color:var(--color-forest)]",
  red: "border-[#8c4a3e4d] bg-[color:var(--color-brick-tint)] text-[color:var(--color-brick)]",
  amber: "border-[#92601f4d] bg-[color:var(--color-bronze-tint)] text-[color:var(--color-bronze)]",
  gray: "border-[#0000001f] bg-[#00000008] text-black/50",
  blue: "border-[#27354a40] bg-[color:var(--color-slate-tint)] text-ir-slate",
};

export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={clsx("ir-badge", BADGE_TONES[tone])}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="ir-card flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
      <div className="h-px w-8 bg-ir-gold/50" />
      <div className="text-sm font-medium text-ir-navy">{title}</div>
      {description && <div className="max-w-sm text-xs leading-relaxed text-black/50">{description}</div>}
      {action && <div className="mt-2.5">{action}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, basePath }: { tabs: { key: string; label: string }[]; active: string; basePath: string }) {
  return (
    <div className="mb-6 flex gap-5 overflow-x-auto border-b border-black/8">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`${basePath}?tab=${t.key}`}
          className={clsx(
            "shrink-0 border-b-[1.5px] px-0.5 py-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] transition-colors",
            active === t.key ? "border-ir-gold text-ir-navy" : "border-transparent text-black/38 hover:text-ir-navy",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const tone = value >= 80 ? "bg-[color:var(--color-forest)]" : value >= 50 ? "bg-ir-gold" : "bg-[color:var(--color-brick)]";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-black/8">
        <div className={clsx("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="ir-figure text-[0.7rem] text-black/45">{value}%</span>
    </div>
  );
}

export function ScoreRing({ value }: { value: number }) {
  const tone = value >= 80 ? "text-[color:var(--color-forest)]" : value >= 60 ? "text-ir-gold-dark" : "text-black/35";
  return (
    <div
      className={clsx("ir-figure flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[1.5px] text-sm", tone)}
      style={{ borderColor: "currentColor" }}
    >
      {value}
    </div>
  );
}

export function SectionCard({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="ir-card p-5">
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h3 className="ir-label !text-ir-navy/70">{title}</h3>}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="ir-label mb-1">{label}</div>
      <div className="text-sm text-ir-navy">{value ?? <span className="text-black/30">-</span>}</div>
    </div>
  );
}
