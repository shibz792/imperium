# Imperium Realty OS

**Property Intelligence and Deal Management** for the Sri Lankan real estate market.
*Property intelligence. Precisely matched.*

A private inventory, CRM, AI intake and matching platform — built as a working local application, not a mockup. Every screen below reads and writes a real SQLite database through Prisma; nothing is hard-coded UI.

---

## 1. Quickstart

```bash
cd app
npm install
npm run db:push     # create the SQLite schema (prisma/dev.db)
npm run db:seed      # populate ~18 properties, 14 requirements, 25 contacts, deals, tasks…
npm run dev           # http://localhost:3000
```

Open **http://localhost:3000** — you'll land on `/login`.

### Accounts

Two accounts, sign in with either a username or a full email:

| Role | Username / Email | Password |
|---|---|---|
| Super Administrator | `shiham` / shiham@imperiumrealty.lk | `Imperium@123` |
| Property Agent | `rahman` / rahman@imperiumrealty.lk | `Imperium@123` |

Field-level access control is real, not just page-level: open the same property or contact as each account and compare — phone numbers, owner minimum price and internal legal notes are hidden field-by-field for the agent role, per spec §10/§13 ("field-level restrictions, not merely page-level"). Add more accounts from Administration → Users (Super Admin only), or add an external broker/agency (no login) from Agents → "Add external broker / agency".

### Resetting the data

```bash
npm run db:reset     # force-reset schema + reseed from scratch
```

---

## 2. What's actually implemented

This is a working **Phase 1 + Phase 2 MVP** (per the roadmap in §14 of the brief) — the five things the brief calls out as the real product, plus the operational layer on top:

| Module | Status | Notes |
|---|---|---|
| **Command Centre** | ✅ | Live counts, tasks, viewings, offers, pipeline value, stale listings, demand hotspots, activity feed |
| **Properties** | ✅ | Full structured record (location/measurements/pricing/features/ownership/docs), table + filters, completeness score, tabbed detail (Overview/Media/Owner/Documents/Matches/Inquiries/Viewings/Offers/Marketing/Activity) |
| **Requirements** | ✅ | First-class record, reconfirmation workflow, tabbed detail with live matches |
| **Imperium AI Intake** | ✅ | Paste text → structured draft(s) → split-screen review with per-field confidence, missing-field flags, duplicate detection against the live DB → **nothing is written until you click Approve** |
| **Matchmaker** | ✅ | Hard filters + weighted score (Location 30 / Budget 20 / Type 15 / Size 15 / Features 10 / Availability 5 / Freshness 5), self-explaining match text, WhatsApp-ready message generator, "share" logging, plus a live search of ikman.lk & LankaPropertyWeb pre-filled from the requirement when nothing in the database fits |
| **External Sourcing** | ✅ | Live search + import from ikman.lk and LankaPropertyWeb (on-demand, not a background crawler), extracts the listing and the poster's contact details, nothing is created until you approve the draft |
| **WhatsApp** | ✅ / 🔧 | Click-to-chat is live everywhere a phone number appears, zero setup. The Cloud API (send + inbound-to-AI-Intake) is code-complete (`src/lib/whatsapp.ts`, `/api/whatsapp/webhook`) but inert until real Meta credentials are set — see §4 |
| **Agents** | ✅ | Unified roster of internal agents *and* external co-broking partners, each with a performance profile (assigned + collaborating properties/requirements/deals, commission earned) |
| **Contacts / CRM** | ✅ | Owners, buyers, tenants, brokers, developers, investors — linked properties/requirements/deals |
| **Deals Pipeline** | ✅ | Kanban + list, 11-stage pipeline, offers, auto-drafted commission on Closed Won, multi-agent collaborators |
| **Viewings** | ✅ | Scheduling, agent assignment, status, feedback capture |
| **Marketing Studio** | ✅ | 10 content types × 3 languages, generated **only from approved database facts**, approval workflow |
| **Document Vault** | ✅ | Upload, category, confidential flag, **role-gated download route** (files live outside `public/`, every download is audit-logged) |
| **Commission Centre** | ✅ | Agency fee / agent split / broker split, status workflow, finance-only access |
| **Analytics** | ✅ | Demand heatmap (location × category), inventory gap report, conversion funnel, agent performance & commission |
| **Administration** | ✅ | Users & roles, location/category reference data, audit log viewer |
| **Audit trail** | ✅ | Every create/update/status-change/download writes to `AuditLog` |

### Working with more than one agent

Every property, requirement and deal has a single primary **assigned agent**, but real agencies co-work listings — so each also carries a *collaborators* list (an agent multi-select on the create/edit form, shown as badges everywhere the record appears). The `/agents` roster unifies both sides of "we work with multiple agents":

- **Internal team** — staff accounts (Agent/Sales Manager/Director/Super Admin), each with a profile (title, territory, bio) and a live performance card: assigned inventory, open vs. closed-won deals, commission earned, and everything they're collaborating on.
- **External partners** — Contacts of type Broker. Their profile is the existing Contact record, extended with a "Co-brokered deals" section wired to `Deal.otherBroker`, and they get their own roster card under "External partners" so they're discoverable the same way internal agents are.

### Deliberately out of scope for this build (see §8 Roadmap)

Public marketplace, Gmail / Meta lead-form ingestion, Google Maps/Places autocomplete, owner/broker portals, PDF brochure rendering, voice/screenshot AI intake, PostGIS radius search. WhatsApp and ikman.lk/LankaPropertyWeb sourcing, both originally Phase 3 ideas, are now implemented (see above). These remaining items are Phase 3/4 in the brief and need external accounts (Google Cloud, Meta) this environment doesn't have — the architecture underneath (Prisma schema, `lib/ai-intake.ts` engine abstraction, `lib/groq.ts`) is already shaped to slot them in without a rewrite.

---

## 3. Imperium AI Intake — how it actually works

Two interchangeable extraction engines behind one interface (`src/lib/ai-intake.ts`):

- **Groq LLM** (`src/lib/groq.ts`) — used automatically if `GROQ_API_KEY` is set in `.env`. Get a free key at [console.groq.com](https://console.groq.com). Real free-text understanding, multilingual, handles messy input.
- **Offline heuristic parser** — zero-config fallback. Regex + keyword scoring for phone numbers, Sri Lankan measurement units (perches/acres/sqft), price shorthand (lakhs/crores/mn), location matching against the seeded district/city list, property-vs-requirement classification, and duplicate detection against live Contacts/Properties/Requirements.

Try the **"Insert example"** button on `/ai-intake` — it's the exact example from the product brief (Adam's warehouse requirement). Both engines were validated against it directly during development (see the confidence score, extracted fields and flagged duplicate against the seeded "Adam Careem" contact).

Every extraction is logged to `AiIntakeJob` before review, and every approval writes through the same `writeAudit`/`logActivity` helpers as manual entry — there is no code path that publishes an AI draft without a human clicking Approve.

---

## 4. Environment variables (`.env`)

```bash
DATABASE_URL="file:./prisma/dev.db"
SESSION_SECRET="imperium-realty-dev-secret-change-me"   # change for anything beyond localhost
GROQ_API_KEY=""                                          # optional, enables real LLM everywhere
GROQ_MODEL="llama-3.3-70b-versatile"

# optional — WhatsApp Business Cloud API (send + inbound webhook). Click-to-chat
# works with none of these set; only the Cloud API tier needs them.
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_VERIFY_TOKEN=""
WHATSAPP_APP_SECRET=""
```

Leaving `GROQ_API_KEY` blank is a fully supported mode. AI Intake and Marketing Studio both fall back to their offline engines automatically and say so in the UI.

---

## 5. Architecture

- **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript**, brand theme via Tailwind v4 CSS tokens (`src/app/globals.css`) — Imperium Navy `#091526`, Champagne Gold `#CCA274`, Warm Ivory `#F5F2ED`.
- **SQLite via Prisma 7** (`@prisma/adapter-better-sqlite3`) — the whole schema (`prisma/schema.prisma`) is written against relations/enums that map 1:1 onto Postgres; swapping the datasource provider and adapter is the only change needed to move to Postgres/PostGIS for real geo radius search.
- **Auth**: lightweight HMAC-signed session cookie (`src/lib/session.ts`), no external dependency. Good enough for local/demo use — see §7 before deploying anywhere real.
- **Multi-agent**: `assignedAgentId` (single, required) plus an implicit `collaborators` many-to-many on Property/Requirement/Deal — a listing keeps one clear owner but any number of co-agents.
- **Matching engine**: pure function `scoreMatch()` in `src/lib/match.ts` — hard filters first (category/transaction/budget/size/location), then the weighted score from §6 of the brief, with a generated human-readable explanation per match.
- **RBAC**: `src/lib/auth.ts` (`CONFIDENTIAL_ROLES`, `FINANCE_ROLES`, `ADMIN_ROLES`) gates both routes (`requireRole`) and individual fields (`canSeeConfidential`) — checked in the JSX, not just at the router.
- **A real bug worth knowing about**: this Next.js/Prisma combination silently 500s (a generic Turbopack manifest error, no useful stack trace) if a `'use client'` component ever imports anything that pulls in `next/headers`/Prisma transitively — e.g. importing `ROLE_LABELS` from `lib/auth.ts` into the client-side `Sidebar`. Fixed by extracting client-safe constants into `src/lib/roles.ts`. If you add new client components, keep server-only imports (`lib/auth.ts`, `lib/prisma.ts`) out of them.

## 6. Design system — "a private ledger, not a SaaS dashboard"

The brief was explicit: navy/gold/ivory, thin borders, minimal shadows, no bubble components, no generic blue SaaS interface. The signature idea that carries that through the whole app is treating **every number that represents value** — prices, match scores, stat-tile figures, reference codes — in the serif display face with tabular figures (`.ir-figure` in `globals.css`), while everything else stays in Manrope. Status badges are bordered rectangular tags in muted brand-derived tones (`--color-forest`/`--color-bronze`/`--color-brick`, not stock Tailwind red/green/amber) rather than filled pills, which reads closer to a museum object label than a notification bubble. Property cards (`/properties?view=cards`) use a quiet navy panel with a category-mark watermark instead of a stretched logo or a stock photo, since there's no real photography yet.

**Two real CSS cascade bugs were caught by inspecting computed styles, not just eyeballing a screenshot** — worth knowing if you extend `globals.css`:

1. A blanket `* { border-color: … }` reset lived *outside* any `@layer` block. In CSS, an unlayered rule beats every layered rule regardless of specificity — and Tailwind v4's own utilities live in `@layer utilities`. That silently made every `border-*` color utility in the app a no-op.
2. Custom component classes (`.ir-badge`, etc.) had the same problem one level down: `.ir-badge { border: 1px solid transparent; }` was also unlayered, so it beat a Tailwind border-color utility applied alongside it on the same element.

Fix: all custom CSS now lives inside explicit `@layer base` / `@layer components` blocks, which is also just the idiomatic Tailwind v4 structure — utilities correctly override component defaults again. If a border color you set via a utility class doesn't seem to apply, check for an unlayered rule fighting it before assuming it's a Tailwind config issue.

## 7. Privacy & security — what's real vs. simulated

Built with §13 of the brief in mind, honestly scoped:

**Implemented:** role + field-level access control, full audit history on every mutation, gated document downloads (files stored outside `public/`, confidential docs 403 for non-confidential roles, every download logged), separate public/confidential notes fields, session cookie is `httpOnly`/`sameSite=lax`.

**Not implemented — needed before this goes anywhere beyond localhost:** multi-factor authentication, session timeout enforcement, encryption at rest (SQLite file is plaintext on disk), signed **expiring** links (the download route is access-gated but links don't expire), consent/retention-period workflows, data export/erasure tooling, vendor DPAs, backup/DR. The Personal Data Protection Act obligations referenced in the brief (commencing 1 Jan 2027) are a genuine reason to build these before real personal data goes anywhere near this app.

---

## 8. Roadmap (unchanged from the product brief, §14)

- **Phase 3 — Connected intelligence**: direct WhatsApp Business Cloud API intake, Gmail/Outlook inbox monitoring, voice/screenshot AI intake, Meta lead-form ingestion, Google Maps/Places autocomplete + PostGIS radius search, owner & broker portals (the `OWNER_PORTAL`/`CLIENT_PORTAL` roles already exist in the schema and show a placeholder screen today), automated owner reports.
- **Phase 4 — Public marketplace**: public search portal, saved searches, SEO property pages, listing syndication — only once the private inventory is strong, per the brief's own recommendation.

---

## 9. Project structure

```
app/
  prisma/schema.prisma        # every model — Property, Requirement, Contact, Deal, Commission, AuditLog…
  prisma/seed.ts               # realistic Sri Lankan seed dataset
  src/lib/                     # matching engine, AI intake, auth/RBAC, refs, formatting
  src/app/login/                # public
  src/app/(platform)/           # authenticated shell — one folder per module (agents/ included)
  src/app/api/documents/[id]/download/   # role-gated file download
  storage/documents/            # uploaded files (outside public/, never statically reachable)
```
