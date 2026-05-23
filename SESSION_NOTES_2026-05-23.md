# Session notes — 2026-05-23

End-of-session wrap up. **PR #1 was merged to main** as commit `2c00bdb`. This file is the durable session map so a fresh Claude Code session can pick up cleanly.

## What's on main right now

The branch covered ~3 days of work across 124 commits. High-level grouping (every item below is in main):

### Job Flow workflow
- `src/app/(app)/job-flow/job-flows/page.tsx` — pipeline analytics (stage counts, on-hold callout, recent activity)
- `src/components/job-flow/job-flow-chart.tsx` — interactive stage chart with three-state coloring (gray/red/black), Next Step button, Revert button
- `src/app/(app)/job-flow/jobs/[id]/page.tsx` — main job detail page (Customer / Calendar / Pick List / Notes / Details order, Reset Job button for admins, Print top-right)
- `src/app/(app)/job-flow/jobs/[id]/inspection/page.tsx` + `src/components/job-flow/inspection-form.tsx` — per-component Good/Repaired/Dead, batch Save, keyboard shortcuts (Cmd+S / Cmd+J / Esc), Jump to next undecided
- `src/app/(app)/job-flow/jobs/[id]/change-order/page.tsx` + `src/components/job-flow/change-order-editor.tsx` — editable kit components, Save/Cancel at bottom, kit-recipe expansion
- `src/app/(app)/job-flow/jobs/[id]/deactivate/page.tsx` + `src/components/job-flow/deactivate-form.tsx` — per-component Return/Scrap decisions
- `src/app/(app)/job-flow/jobs/[id]/awaiting-stock/page.tsx` — shortage release flow

### Customer-side
- `src/app/(app)/job-flow/clients/[id]/page.tsx` — customer detail page (stat strip, contact / properties / kits in storage / job history)
- `src/components/client-status-controls.tsx` — two-step Deactivate / one-click Reactivate
- `src/lib/actions/clients.ts` — `setClientActive(clientId, active, reason?)`
- Customer card on the job page links to the detail page with New / Existing / Deactivated badge

### Inventory + reporting
- `src/app/(app)/inventory/items/[id]/page.tsx` — item detail page (kills four dashboard 404s)
- `src/app/(app)/inventory/dead-stock/page.tsx` — date-filtered Dead Stock report with Print
- `src/app/(app)/inventory/replacements/page.tsx` — ReplacementQueue triage UI
- `src/app/(app)/job-flow/deactivations/page.tsx` — season Deactivations report with Print
- `src/lib/actions/replacements.ts` — `resolveReplacement`, `reopenReplacement`

### Lists with pagination
- `src/app/(app)/inventory/items/page.tsx` (PAGE_SIZE = 50)
- `src/app/(app)/inventory/kits/page.tsx` (PAGE_SIZE = 50)
- `src/app/(app)/job-flow/jobs/page.tsx` (PAGE_SIZE = 50, with `currentStage` column, search, stage filter, customer-active filter)
- `src/app/(app)/job-flow/pick-list/page.tsx` (repurposed as "upcoming pick lists" — 7d/30d/all)
- `src/components/pagination.tsx` — shared component + `parsePageParam` helper

### Year-2 / CustomerKit lifecycle
- `src/lib/actions/auto-allocate.ts` — Year-2 tote consumption branch (`autoAllocateJob` + `releaseAwaitingStock`), per-line transaction re-reads to prevent inventory race
- `src/lib/actions/complete-job.ts` — `completeJobForClient` (flips customer to EXISTING + materializes CustomerKit + skips DEAD components from snapshot)
- `src/lib/actions/inspection.ts` — `saveInspectionDecisions` (batch save, snapshot delta for tote-sourced DEAD, ReplacementQueue auto-write)
- `src/lib/actions/deactivate.ts` — `deactivateJob` (per-component Return/Scrap, tote cleanup including COMPLETE-time additions, clears `customerKitsSyncedAt`)
- `src/lib/actions/change-order.ts` — `applyChangeOrder` (reconcile lines preserving `kitsFromTote`, fresh-portion diff math, removes ChangeOrder rows on Reset)
- `src/lib/actions/reset-job.ts` — `resetJob(jobId, "RESET")` (full unwind including customer-status revert with mixed-legacy handling)
- `src/components/job-flow/reset-job-button.tsx` — two-step confirmation dialog (ADMIN only)

### Auth + access control
- `src/auth.ts` + `src/auth.config.ts` — NextAuth v5 credentials
- `src/lib/auth-helpers.ts` — `requireUser`, `requireRole`, `assertRoleForAction` (now re-queries DB on every call), `roleLabel`, `WRITE_ROLES`, `ADMIN_ROLES`
- `src/components/demo-banner.tsx` — yellow banner when `role === "GUEST"`
- `src/app/(app)/layout.tsx` — renders DemoBanner conditionally
- Role enum has `ADMIN`, `MANAGER`, `USER` (labeled "Crew"), `GUEST`

### Schema (`prisma/schema.prisma`)
Added in this session:
- `JobStage` enum + `JobberJob.currentStage`, `isOnHold`, `customerKitsSyncedAt`
- `JobLineItem.isAllocated`, `kitsFromTote`
- `JobLineShortage`, `JobStageEvent`, `ChangeOrder`
- `InspectionDecision` enum + `InspectionLineDecision`, `InspectionComponentDecision`
- `CustomerEra` enum + `Client.customerStatus`, `firstCompletedAt`
- `Client.active`, `deactivatedAt`, `deactivationReason`
- `CustomerKitStatus` enum + `CustomerKit`, `CustomerKitItem`
- `ReplacementQueue.quantity`
- `Role.GUEST`

Removed (were defined but unused, no writers anywhere):
- `Vehicle`, `Allocation`, `Season`, `AuditLog`, `AllocationStatus` enum

### Print system
- `src/app/globals.css` — universal black-on-white print reset via `*, *::before, *::after` (every text/border/bg `!important`'d). Sections flow across pages naturally (no `break-inside: avoid` on `.print-block` anymore).
- Print buttons standardized to top-right of page header on: Jobs detail, Pick List detail, Inspection, Deactivate, Change Order, Dead Stock, Deactivations.

### Global fallbacks
- `src/app/(app)/loading.tsx`, `error.tsx`, `not-found.tsx` — authenticated route group
- `src/app/not-found.tsx`, `error.tsx` — public routes
- Zero of these existed before this session

## Reference docs in the repo

- `README.md` — original project doc
- `SESSION_NOTES.md` — early notes from before this session
- `SESSION_NOTES_2026-05-21.md` — first-day session recap
- `SESSION_NOTES_2026-05-23.md` — this file (latest)
- `SAAS_CONVERSION_ROADMAP.md` — strategic roadmap for converting to multi-tenant SaaS later (deferred work; documented in detail)
- `inventory-app-feature-research.pdf` — original research

## Intentionally deferred items

Documented for future sessions, NOT shipped:

- **Multi-tenant SaaS conversion** — full roadmap in `SAAS_CONVERSION_ROADMAP.md`. Convert early if you ever go this direction.
- **Mobile responsiveness** — app is desktop-first; Calendar Month grid and Job Flow split-pane squeeze badly below `lg`. Real mobile work would need its own session.
- **Toast/flash UX standardization** — current silent-redirect-on-save is fine; adding a flash before redirect would make actions feel sluggish.
- **Concurrent allocation against the same tote (audit #10)** — status filter on `findFirst({ status: "IN_STORAGE" })` gates this in practice. True race is theoretical and would need Postgres row-level locking for defense-in-depth.
- **ReplacementQueue REPAIRED qty change update (audit #17)** — audit-trail staleness on a triage row; minor.
- **`assertRoleForAction` generic error (audit #23)** — minimal UX impact; admin pages gate at the page level.
- **CSV import — minor field edge cases** — only relevant if importing complex kit recipes.

## Audit findings I rejected after re-tracing

- **#1 (deactivate over-refunds)** and **#9 (Deactivations totals)** — current code is correct. Tote contents were originally pulled from the shared pool in a prior season; refunding them on customer departure is correct accounting.
- **#13 (`isAllocated=true` with shortage)** — by design. Release button is the heal path; auto-allocate isn't meant to re-process touched lines.

## How to pick up next session

1. The repo's current `main` is at merge commit `2c00bdb`. Pull it.
2. Schema is up to date — Railway auto-applies via `prisma db push` on container start. Verify with one app load + a single allocation.
3. The branch `claude/railway-docs-lookup-mm7zM` is merged and can be deleted via the GitHub UI.
4. If picking up new feature work, start with this doc and the prioritized backlog at the bottom.

## Suggested backlog (in rough priority)

- **Verify the live Year-1 → Year-2 → Reset cycle** with real data. Walk through allocate → inspect → complete → reset, confirm CustomerKit + Item.quantity stay consistent. Highest-value before adding new features.
- **Build a demo GUEST account** for showing the app to prospects (sign in as admin → `/admin/users/new` → role=Guest)
- **Mobile responsiveness** if you ever want field crews on phones — currently desktop-first
- **Toast/flash standardization** — small UX polish, mostly across save flows
- **`/clients` index** — currently customer detail is only reachable via a job. A list view would help when looking up a specific customer cold
- **Per-property tote tracking precision** — `CustomerKit` allows nullable `propertyId` but the lookup ignores property when null. If a single client has totes at multiple properties this might cause subtle mismatches
- **Vehicle reg / insurance expiry** — was explicitly declined; the schema model was dropped too. Resurrect only if business need changes

## Container state

This Claude Code session is running in a remote ephemeral container. Everything important is in the repo (pushed to GitHub). The container will be reclaimed after inactivity. There is nothing local-only worth preserving.

## Branch / push state

- `main` is at `2c00bdb` (PR #1 merge commit)
- `claude/railway-docs-lookup-mm7zM` is merged into main, can be deleted from GitHub
- `claude/session-notes-refresh-2026-05-23` is the branch this file landed on, opening as a small PR
