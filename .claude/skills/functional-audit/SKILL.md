---
name: functional-audit
description: Audits Imperium Realty OS for bugs, broken flows, and dead/redundant code — the correctness counterpart to ui-ux-audit (which covers look/feel/UX, not this). Runs real UAT against a live dev server using a disposable test account driven with Playwright, always cleaned up after, rather than trusting build/lint alone. Produces a severity-ranked bug/UAT report as a published Artifact, then a separate, individually-verified dead-code removal pass. Never flags or touches the WhatsApp Business Cloud API integration (lib/whatsapp.ts) — it's intentionally dormant until real Meta credentials exist, not unused. Use when asked to audit for bugs, run UAT/QA, verify everything works, or clean up dead/redundant code.
license: Internal
metadata:
  author: imperium-realty
  version: "1.0"
---

# Functional Audit, UAT & Dead-Code Cleanup — Imperium Realty OS

Two separate passes, run in order. **Phase 1 only reports — it must not
change any code**, even an obvious one-line fix, for the same reason
`ui-ux-audit` doesn't: the person reading the report needs to see the true
state before anything changes underneath them. **Phase 2 does make
changes**, but only removals individually verified as genuinely unused
before touching them — never a batch cleanup on a hunch.

**Hard exclusion, both phases:** never flag, remove, or "clean up"
anything under `src/lib/whatsapp.ts`'s Cloud API path
(`sendWhatsAppMessage`, `verifyWebhookHandshake`, `verifyWebhookSignature`,
`parseInboundMessages`, the `/api/whatsapp/webhook` route) for being
unused. It's coded against Meta's real, documented API and dormant only
because `WHATSAPP_ACCESS_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` aren't set yet —
the exact same shape as Google OAuth (`lib/google.ts`) and Resend email
(`lib/email.ts`) elsewhere in this app. Being unexercised in this
environment is not the same as being dead code, and the same logic
protects those two as well — don't flag any of the three dormant
integrations as redundant just because they're currently inactive.

## Phase 1 — Bug audit & real UAT

### 0. Orient

- `git log --oneline -40` — know what's shipped recently so the audit
  targets what's actually new/risky, not a re-litigation of settled work.
- Skim `AGENTS.md` (this app's Next.js version has real breaking changes
  from training data — check anything unusual against
  `node_modules/next/dist/docs/` before calling it a bug) and
  `next.config.ts` (anything special-cased there, e.g.
  `serverExternalPackages: ["pdfkit"]`, is there because of a real
  production failure found the hard way — confirm it's still accurate and
  still complete, don't assume it's fine because it's already there).
- `src/lib/roles.ts` and `src/lib/nav.ts` for the current access-control
  model — this skill checks it from the correctness/security angle (is
  every route actually enforced server-side); `ui-ux-audit` checks it from
  the UX angle (does a hidden nav link imply false safety). Don't
  duplicate that skill's framing, but do run the enforcement sweep in §2.

### 1. Get a real, disposable login — don't audit from the outside only

Static review catches a fraction of what actually breaks in this app.
There's a real history here: code that type-checked and built cleanly but
broke on first actual use — a phone field that silently produced
malformed numbers, a PDF library whose fonts 404'd only once bundled by
Next.js, an AI extraction field that mapped bedroom count into a
floor-area field, a Drive permission gap that showed a generic "not
configured" message instead of the real cause. All of these were only
caught by actually driving the running app; none showed up in a diff
review or a green build.

1. Confirm a dev server is reachable
   (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/login`);
   start one with `npm run dev` if not. It points at the same
   `DATABASE_URL` as production (a shared Supabase instance, not a
   sandbox) — treat every write as real.
2. Create one disposable SUPER_ADMIN account directly via Prisma
   (bcrypt-hash a password, insert a `User` row) to log in as. Do not
   guess at or ask for a real user's password. Name it obviously, e.g.
   `audit-temp@imperiumrealty.lk`.
3. Drive it with Playwright — already available in this environment.
   Headless chromium, screenshot anything you're not fully sure of, and
   actually read the screenshot rather than trusting a status code alone.
4. **Unconditionally delete the disposable account before finishing this
   skill**, and review/revert any test data mutated along the way — a
   contact's phone number changed mid-test, a stray Requirement/Property/
   SharePage/MarketingAsset created for the test. Read back exactly what
   changed and restore it deliberately; don't assume it's harmless
   clutter. Do this even if the audit run is interrupted partway —
   cleanup is not optional.
5. If a live login genuinely isn't available (no dev server reachable, no
   DB write access), say so plainly in the report and fall back to source
   review plus `curl` against the deployed app for status codes/redirects.
   Phrase source-only findings as "the code does X" / "there's no guard
   against Y" — never as if a live click were actually performed.

### 2. UAT checklist — perform the action, confirm the result

For each area, actually do it and check the *outcome* landed correctly —
not just that a button exists or a page redirected. Create something and
verify it's really in the database with the right values.

- **Auth & access control.** Sweep every route under `src/app/(platform)`:
  ```
  for f in $(find "src/app/(platform)" -name page.tsx); do
    grep -q "requireRole\|requireUser" "$f" || echo "UNGUARDED: $f"
  done
  ```
  Any hit is a real, High-severity gap — this app has shipped a page with
  zero auth check before (Properties list/new/edit, reachable by anyone
  with the URL). Also cross-check each route's `roles` entry in `nav.ts`
  against its actual `requireRole()` call — a mismatch is a real gap even
  if both individually look fine.
- **Properties.** Create one via the form. Upload a real (or large
  synthetic) photo and confirm it doesn't hit the Server Action body-size
  limit. Set cover, edit, confirm delete is reachable from *both* the list
  and the detail view. Confirm deleting a referenced property is blocked
  with a clear message (`deleteGuard.ts`), not a crash.
- **AI Intake.** Paste a multi-fact, multi-turn WhatsApp-shaped sample
  (agent + customer turns, a self-correction, a second phone number — see
  this session's own verification script for the shape) and check every
  fact landed in the *semantically correct* field, not just that nothing
  came back empty — specifically watch for the "right value, wrong field"
  defect class (a real fact that got mapped somewhere that doesn't match
  its meaning, the same shape as the bedroom-count-into-floor-area bug
  already found once). Approve a draft and confirm the resulting Property/
  Requirement record actually has those values, not just that a row was
  created.
- **Requirements.** Matches tab shows real scores. "Send matches to
  client" and "Circulate to broker network" both produce a real,
  non-empty message when the data supports it, and an honest empty state
  when it doesn't (not a spinner that never resolves).
- **Marketing Studio.** Generate per-channel content for a real property
  and confirm the output is actually shaped for that channel (e.g. a
  WhatsApp result under the length `CHANNEL_SPECS` specifies — not generic
  prose reused across formats). Generate a social image tile and a PDF
  brochure and actually open/inspect the resulting file — the Read tool
  renders PDFs and images directly, use it, don't stop at an HTTP 200.
  Confirm WhatsApp/email send buttons are *absent* (not merely disabled)
  when that integration isn't configured.
- **Share pages.** Create one, then fetch `/share/[slug]` from a
  **second, unauthenticated** Playwright context (a fresh
  `chromium.launch()`, not the logged-in page) — confirm it's genuinely
  reachable with no session, respects `hideOwnerContact`/
  `hideExactLocation`, and that a wrong password on a protected one is
  actually rejected, not silently bypassed.
- **Deals.** Kanban drag-and-drop persists a stage change — reload and
  confirm, don't trust the optimistic UI alone. Delete reachable from both
  the kanban and the list view.
- **Two-tier dormant integrations** (Google OAuth/Drive, WhatsApp Cloud
  API, Resend email). Confirm each fails *specifically and actionably*
  when unconfigured — Settings should name the exact missing permission/
  scope (the `storageAccountIssue()` pattern), never a generic "not
  configured" that sends someone looking in the wrong place.

### 3. Write up Phase 1

Same severity model as `ui-ux-audit`: **High** (data loss, a broken core
workflow, an access-control gap, or a UAT step that produced wrong data
silently), **Medium** (a real defect, not urgent), **Low** (edge case).
For each: what's wrong, exactly where, how it was confirmed (which UAT
step — or "source review only, see limitation note"), and the concrete
fix. Load `artifact-design` and publish as an Artifact, grounded in this
app's own tokens (navy/gold/ivory, Fraunces-style serif, the forest/
bronze/brick good/warn/danger mapping) the same way `ui-ux-audit` is.
State plainly in the chat reply whether this was live UAT or source-only.

## Phase 2 — Dead/redundant code cleanup

Only after Phase 1's report is published. This phase makes real changes,
but every single removal is individually verified — never batched on a
hunch that a file "looks unused."

### Candidates to check (starting points, not conclusions)

- **Unused exports.** For a suspect export:
  `grep -rn "exportedName" src/ --include="*.ts*"` — confirm every hit
  besides the definition is a real call site, not a comment or an
  unrelated string match. Zero real call sites = a removal candidate.
- **Prisma models/fields with no code usage.**
  `grep -rn "modelName" src/` for each schema model — one referenced only
  in `schema.prisma` and nowhere in `src/` is either genuinely dead or (as
  `SharePage` was, before this session finished building it) a
  half-finished feature someone scaffolded intentionally. Tell the two
  apart before touching anything — check `git log` for why the field was
  added. Report a half-finished feature as a Phase 1 finding; only remove
  a field/model confirmed genuinely obsolete (superseded by a later,
  shipped approach).
- **Unused npm dependencies.** Cross-check `package.json` against real
  imports (`grep -rn "from \"pkg-name\"" src/`) — but also check
  `next.config.ts` and other config files, not just `src/`, since a
  dependency can be required there without an `import` in application
  code (e.g. `serverExternalPackages`).
- **Leftover scratch/debug artifacts.** Anything named `scratch-*` or
  `test-*.mjs/.cjs/.ts` sitting in the repo root or `src/` that isn't real
  test infrastructure — these should never have been committed. If
  `git log` shows one landing in a real commit, remove it.
- **Duplicate logic.** Two components/functions doing near-identical work
  that could share one implementation. Only merge them in this pass if
  it's a small, low-risk extraction with an obvious existing home (e.g.
  the kind of thing `CopyLinkButton` already consolidated); otherwise
  report it in Phase 1 as a refactor suggestion instead of doing it live.
- **Stale comments/TODOs.** A comment describing behavior that's since
  changed (check it against the code it's actually attached to) is worse
  than no comment — fix or remove it.

### Before removing anything

1. Confirm zero real usages, including dynamic references a naive grep
   misses (`formData.get("fieldName")`, a string-built import path, a
   Prisma field read only through a spread or a `as never` cast).
2. Remove it, then `npm run build && npm run lint` — both must stay
   clean.
3. If the removal touches anything a UAT step in Phase 1 exercised,
   re-run that specific step live rather than trusting the build alone.
4. Commit removals separately from the Phase 1 report (and separately
   from any unrelated fixes), with a message naming exactly what was
   confirmed unused and how it was confirmed.

## Close the loop

In the chat reply: lead with the Phase 1 High-finding count and the
single most important thing to know, same as `ui-ux-audit`. Then state
plainly what Phase 2 actually removed — or that nothing met the bar; a
clean result is a legitimate outcome, don't force a removal just to
justify having run the phase. Confirm the disposable audit account was
created and deleted, and name anything still worth a human
double-checking.
