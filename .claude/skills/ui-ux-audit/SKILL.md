---
name: ui-ux-audit
description: Audits Imperium Realty OS's look, feel, and user experience — navigation, daily workflows, interaction patterns, accessibility, and consistency against the app's own design system. Produces a severity-ranked report as a published Artifact. Use when asked to review, audit, or assess the platform's UI/UX, design, usability, or user journey — not for auditing code quality/security (that's a different job) and not for implementing fixes (report only, unless explicitly told to also apply them).
license: Internal
metadata:
  author: imperium-realty
  version: "1.0"
---

# UI/UX Audit — Imperium Realty OS

A repeatable playbook for assessing this specific product's usability, not a
generic heuristics checklist. Run it end to end each time; it's designed to
catch both new problems and regressions of ones already fixed once.

**Scope discipline:** this skill produces a report. Do not fix anything
while running it, even an obvious one-liner — findings and fixes are two
separate asks, and the person reading the report needs to see the true
state before anything changes underneath them. If asked to "audit and fix"
in the same request, finish the full audit and publish it first, *then*
start fixing off the published list.

## 0. Orient before auditing

Skim, don't deep-read yet:
- `src/lib/nav.ts` — the current information architecture and per-role access groups (`SALES_TEAM_ROLES`, `DEAL_ROLES`, etc. in `src/lib/roles.ts`).
- `src/app/globals.css` — the design tokens (`--color-navy`, `--color-gold`, `--color-ivory`, `--color-forest`/`--color-bronze`/`--color-brick` as good/warn/danger, `--font-fraunces` / `--font-jakarta`) and the `.ir-*` utility classes (`ir-card`, `ir-btn-*`, `ir-badge`, `ir-label`, `ir-figure`, `ir-input`/`ir-select`). Any finding about visual inconsistency should reference these by name, not invent new ones.
- `src/components/ui.tsx` — the shared primitives (`PageHeader`, `SectionCard`, `EmptyState`, `Badge`, `Tabs`, `Field`, `StatTile`). A page that reinvents one of these instead of using it is itself a finding.
- Recent git log (`git log --oneline -30`) — know what's already been fixed recently so the audit doesn't re-report it as new, and *does* check it hasn't regressed.

## 1. Can you actually log in?

Check first — it changes how much of this skill you can run for real:
- Look for a live dev server and valid credentials already in context or memory.
- If real credentials exist, do this audit live: Playwright through the actual
  logged-in app, on both a desktop and a mobile viewport, clicking through the
  journey in §2 for real, screenshotting anything questionable.
- If not, say so plainly in the report's methodology note (don't bury it) and
  fall back to a source-level audit: read every page/component/action
  touched by the journey below, cross-referenced against the *deployed* app
  via `curl` (auth redirects, status codes, response headers) so findings are
  checked against what's live, not just what's in the working tree.
- Never fabricate what a live click-through would have shown. A source-level
  finding is phrased as "the code does X" or "there's no guard against Y" —
  not "clicking this button does nothing," unless you actually clicked it.

## 2. Walk the real journey, not a page list

Trace the sequence a working day actually follows, and note friction at each
step — this is what makes the report read as an assessment of the *product*
rather than a page-by-page audit:

1. Log in → Command Centre (dashboard, notifications).
2. A new lead arrives → AI Intake / Sourcing, or a manual Property/Requirement.
3. Matchmaker suggests a fit → shortlist shared.
4. Viewing scheduled → (Google Calendar sync/conflict check if connected) → feedback logged.
5. Deal opens → moves through the kanban → offer → Closed Won → commission auto-drafted.
6. Supporting tools used throughout: Tasks, Notes, Document Vault, Marketing Studio, Contacts, Agents, Commission Centre, Analytics, Admin, Settings.

For each step, note: how many clicks/fields to the outcome, whether the
system confirms the action happened, and what a first-week hire would find
confusing that a six-month veteran wouldn't.

## 3. Systematic checks

Each of these is a real defect class already found and fixed once in this
codebase — check it hasn't crept back in, and sweep for new instances.
Prefer `grep` sweeps over reading every file; only open a file when a sweep
flags it.

**Destructive actions without confirmation**
```
grep -rln "form action={delete" src/app --include="*.tsx"
```
Every result should route through `ConfirmSubmitButton`
(`src/components/ConfirmSubmitButton.tsx`), not a bare `<button
type="submit">`. A new delete button that skips it is a High finding — this
app has no trash/recycle bin, deletes are permanent.

**Forms with no double-submit guard**
```
grep -rln 'type="submit"' src/app --include="*.tsx"
```
Record-*creation* forms (new Property/Requirement/Contact/Deal/Agent/
Viewing, document upload, admin user creation) should use `SubmitButton`
(`src/components/SubmitButton.tsx`, wraps `useFormStatus`), not a plain
button — a slow connection plus an impatient second click creates a
duplicate record. Idempotent actions (status toggles, "mark done", filters)
don't need it; don't flag those.

**Hover-only controls (invisible on touch)**
```
grep -rln "opacity-0.*group-hover\|group-hover.*opacity-100" src/ --include="*.tsx"
```
Anything essential (delete, set-cover, edit) gated behind `:hover` with no
keyboard/touch equivalent is a real defect, not a style choice — there's no
hover state on a phone. A hover-reveal is fine only when there's an
always-visible fallback for the same action elsewhere on the same view (e.g.
the deals-kanban drag handle, which has the "Move to X →" button as a
fallback).

**Icon-only buttons without an accessible name**
```
grep -rn "<button" src/components src/app --include="*.tsx" | grep -v "aria-label\|title="
```
Filter out matches with visible text as a child (false positives). What's
left needs `aria-label` or `title`.

**Nested interactive elements**
Look for a `<button>` or a second `<a>`/`<Link>` inside a `ClickableRow`/
`ClickableCard`/`<Link>`. Invalid HTML, breaks hydration — this exact bug
has shipped twice in this codebase already (Agents broker cards,
PropertyCard). The fix is always `ClickableRow`/`ClickableCard`, which
already excludes clicks on real interactive descendants — never
`stopPropagation` hacks.

**Empty states**
```
for f in "src/app/(platform)"/*/page.tsx; do
  grep -q "findMany\|\.map(" "$f" && ! grep -q "EmptyState\|length === 0" "$f" && echo "$f"
done
```
A list page with no zero-data handling isn't broken, but it looks broken the
first time anyone sees it with nothing in it. Check the message is an
instruction plus a next action, matching the tone already set elsewhere
(`EmptyState` in `src/components/ui.tsx`) — not just "No data."

**Access control drift**
Cross-check `src/lib/nav.ts`'s `roles` on every item against an actual
`requireRole(...)` call in that route's `page.tsx` (and any sibling
`new`/`edit`/`[id]` routes). A nav item with a `roles` restriction but no
matching page-level check is a real access-control gap, not cosmetic — the
link being hidden doesn't stop a direct URL visit. Use the shared groups in
`src/lib/roles.ts` (`SALES_TEAM_ROLES`, `DEAL_ROLES`, `VIEWING_MATCH_ROLES`,
`AI_INTAKE_ROLES`, `SOURCING_ROLES`, `MARKETING_STUDIO_ROLES`,
`DOCUMENT_ROLES`) as the source of truth — if a page's restriction doesn't
match any of these, that's either a new group that needs defining or a
mismatch to flag. Also check pages/widgets that *link* to a restricted
page (Command Centre's stat tiles and widgets, the topbar shortcuts) are
conditioned on the same role check — a visible link to a page that then
bounces you is worse than no link.

**Information architecture**
Count `NAV_ITEMS` in `src/lib/nav.ts`. More than ~14-16 items with no
`section` grouping is a scanability problem on its own — note it even if
nothing else about the nav changed since last audit.

**Terminology consistency**
Scan nav labels and page `<h1>`/`PageHeader title=` text for the same
concept named two different ways (e.g. a page called one thing in the
sidebar and another in its own header), and for any label that breaks an
otherwise-consistent naming pattern (plain feature names vs. one item with
the product name baked in).

**Loading/feedback states**
Any action that hits the network (upload, Drive import, AI extraction)
should show a pending indicator distinct from "nothing happened yet" —
check for `useTransition`/`pending` state, not just a bare `await`.

## 4. Write it up

Severity is the organizing structure, not a numbered list — it's the one
piece of structure in this report that encodes something real (how urgent).

- **High** — data loss risk, broken core workflow, or an access-control gap.
- **Medium** — real friction or inconsistency, not urgent.
- **Low** — polish, edge cases, unlikely-but-possible states.

For each finding: what's wrong, where (`file:line` or a `grep` pattern),
concretely how to fix it (name the actual shared component to use —
`ConfirmSubmitButton`, `SubmitButton`, `EmptyState`, a `lib/roles.ts`
group — not a vague suggestion). Also report genuine strengths with the
same specificity — what's *actually* working and why, not a filler
"nice UI" line. Close with a short prioritized list: the 3-5 highest-value
fixes if only a few get done.

**Before publishing, load the `artifact-design` skill** (per its own
calibration rules — this is a utilitarian report, not a landing page) and
ground the visual design in this app's own tokens (§0) — navy/gold/ivory,
Fraunces-style serif headings with a system-serif fallback (no font CDN;
the CSP blocks it), the same forest/bronze/brick semantic mapping this app
already uses for good/warn/danger, so the report itself feels like it
belongs to the product it's about rather than a generic audit template.
Publish as an Artifact; don't just paste the report into chat.

## 5. Close the loop

In the chat reply (not just the artifact): state plainly whether this was a
live click-through or a source-level review, and if source-level, offer to
redo the highest-risk findings live if given a test login. Don't restate
the whole report in text — point to the artifact and lead with the count of
High findings, if any, and the single most important thing to know.
