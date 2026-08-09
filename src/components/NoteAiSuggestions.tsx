"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sparkles, Check, X, Loader2, ClipboardList, Building2, ListTodo } from "lucide-react";
import { analyzeNote, approveTaskFromNote } from "@/app/(platform)/notes/actions";
import { approvePropertyDraft, approveRequirementDraft } from "@/app/(platform)/ai-intake/actions";
import type { Draft, PropertyDraftFields, RequirementDraftFields, TaskDraftFields } from "@/lib/intake-types";
import { titleCase } from "@/lib/format";

const KIND_META = {
  task: { icon: ListTodo, label: "Task", tone: "bg-ir-gold/20 text-ir-gold-dark" },
  property: { icon: Building2, label: "Property", tone: "bg-ir-navy/10 text-ir-navy" },
  requirement: { icon: ClipboardList, label: "Requirement", tone: "bg-ir-navy/10 text-ir-navy" },
} as const;

// On-demand analysis of one note — never automatic (see the comment on
// analyzeNote in notes/actions.ts). Modeled on AiIntakeClient's DraftCard
// (src/app/(platform)/ai-intake/AiIntakeClient.tsx) but compact — this lives
// inline under a single note, not on a dedicated review page, so it shows
// fewer fields than the full intake flow.
export function NoteAiSuggestions({ noteId }: { noteId: string }) {
  const [state, setState] = useState<"idle" | "done" | "unavailable">("idle");
  const [suggestions, setSuggestions] = useState<Draft[]>([]);
  const [resolved, setResolved] = useState<Record<string, { status: "approved" | "rejected"; recordId?: string }>>({});
  const [pending, startTransition] = useTransition();

  function analyze() {
    startTransition(async () => {
      const result = await analyzeNote(noteId);
      if (result === null) {
        setState("unavailable");
        return;
      }
      setSuggestions(result);
      setResolved({});
      setState("done");
    });
  }

  if (state === "idle") {
    return (
      <button type="button" onClick={analyze} disabled={pending} className="flex items-center gap-1 text-xs font-medium text-ir-gold-dark hover:underline disabled:opacity-50">
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {pending ? "Thinking…" : "Suggest next step"}
      </button>
    );
  }

  if (state === "unavailable") {
    return <span className="text-xs text-black/35">AI suggestions need GROQ_API_KEY configured.</span>;
  }

  if (suggestions.length === 0) {
    return <span className="text-xs text-black/35">Nothing to suggest for this note.</span>;
  }

  return (
    <div className="mt-2 w-full space-y-2">
      {suggestions.map((s) => (
        <SuggestionCard
          key={s.id}
          draft={s}
          resolution={resolved[s.id]}
          onApprove={(fields) =>
            startTransition(async () => {
              let res: { id: string } | undefined;
              if (s.kind === "task") res = await approveTaskFromNote(noteId, fields as TaskDraftFields);
              else if (s.kind === "property") res = await approvePropertyDraft(fields as PropertyDraftFields, s.sourceExcerpt, { source: "Notes" });
              else res = await approveRequirementDraft(fields as RequirementDraftFields, s.sourceExcerpt, { source: "Notes" });
              setResolved((r) => ({ ...r, [s.id]: { status: "approved", recordId: res?.id } }));
            })
          }
          onReject={() => setResolved((r) => ({ ...r, [s.id]: { status: "rejected" } }))}
        />
      ))}
    </div>
  );
}

function SuggestionCard({
  draft,
  resolution,
  onApprove,
  onReject,
}: {
  draft: Draft;
  resolution?: { status: "approved" | "rejected"; recordId?: string };
  onApprove: (fields: PropertyDraftFields | RequirementDraftFields | TaskDraftFields) => void;
  onReject: () => void;
}) {
  const [fields, setFields] = useState<Record<string, unknown>>(draft.fields as Record<string, unknown>);
  const set = (k: string, v: unknown) => setFields((f) => ({ ...f, [k]: v }));
  const meta = KIND_META[draft.kind as keyof typeof KIND_META] ?? KIND_META.task;
  const Icon = meta.icon;

  if (resolution?.status === "approved") {
    const href = draft.kind === "task" ? "/tasks" : draft.kind === "property" ? `/properties/${resolution.recordId}` : `/requirements/${resolution.recordId}`;
    return (
      <div className="flex items-center justify-between gap-2 rounded border border-[color:var(--color-forest)]/25 bg-[color:var(--color-forest)]/10 px-3 py-2 text-xs text-[color:var(--color-forest)]">
        <span className="flex items-center gap-1.5"><Check size={13} /> {meta.label} created.</span>
        <Link href={href} className="font-medium hover:underline">View →</Link>
      </div>
    );
  }
  if (resolution?.status === "rejected") {
    return <div className="flex items-center gap-1.5 rounded border border-black/8 px-3 py-2 text-xs text-black/40"><X size={13} /> Discarded.</div>;
  }

  return (
    <div className="rounded border border-black/10 bg-ir-ivory/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className={`ir-badge inline-flex items-center gap-1 ${meta.tone}`}>
          <Icon size={11} /> {meta.label}
        </span>
        <span className="text-[0.65rem] text-black/40">{draft.confidence}% confidence</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {draft.kind === "task" && (
          <>
            <TextInput label="Title" value={(fields.title as string) ?? ""} onChange={(v) => set("title", v)} className="col-span-2" />
            <TextInput label="Due" type="date" value={(fields.dueAt as string)?.slice(0, 10) ?? ""} onChange={(v) => set("dueAt", v)} />
          </>
        )}
        {draft.kind === "property" && (
          <>
            <TextInput label="Title" value={(fields.title as string) ?? ""} onChange={(v) => set("title", v)} className="col-span-2" />
            <TextInput label="Owner" value={(fields.ownerName as string) ?? ""} onChange={(v) => set("ownerName", v)} />
            <TextInput label="Owner phone" value={(fields.ownerPhone as string) ?? ""} onChange={(v) => set("ownerPhone", v)} />
            <TextInput label="City" value={(fields.city as string) ?? ""} onChange={(v) => set("city", v)} />
            <TextInput label="Price" type="number" value={(fields.totalPrice as number) ?? ""} onChange={(v) => set("totalPrice", Number(v) || undefined)} />
          </>
        )}
        {draft.kind === "requirement" && (
          <>
            <TextInput label="Client" value={(fields.clientName as string) ?? ""} onChange={(v) => set("clientName", v)} />
            <TextInput label="Client phone" value={(fields.clientPhone as string) ?? ""} onChange={(v) => set("clientPhone", v)} />
            <TextInput label="Looking for" value={(fields.title as string) ?? ""} onChange={(v) => set("title", v)} className="col-span-2" />
            <TextInput label="Budget max" type="number" value={(fields.budgetMax as number) ?? ""} onChange={(v) => set("budgetMax", Number(v) || undefined)} />
          </>
        )}
      </div>

      <div className="mt-2.5 flex justify-end gap-1.5">
        <button type="button" onClick={onReject} className="ir-btn ir-btn-ghost !py-1 !text-[0.7rem]"><X size={12} /> Discard</button>
        <button type="button" onClick={() => onApprove(fields as never)} className="ir-btn ir-btn-primary !py-1 !text-[0.7rem]">
          <Check size={12} /> {titleCase(draft.kind)}
        </button>
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  type = "text",
  className = "",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="ir-label mb-0.5 block !text-[0.6rem]">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="ir-input !py-1 !text-xs" />
    </div>
  );
}
