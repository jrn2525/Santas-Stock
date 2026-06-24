# Start-With-Me 🪧

**Read me first when picking up a new session.** I'm the running status/handoff doc for Santa's Stock — what we just did, what's pending, and what to verify. I complement `CLAUDE.md` (which has the project overview, the step-by-step communication style, the git workflow, and the known URLs — all auto-loaded each session, so I don't repeat them).

> **Maintenance:** update me at the end of each session — move finished items out, add new "Open items," and refresh "Last session."

_Last updated: 2026-06-24_

---

## How to use me
1. New session starts → user says "read the Start-With-Me file."
2. Read this, then `CLAUDE.md`, then `git log --oneline -15` to see the latest.
3. Confirm the open items below before starting new work.

## Non-negotiable guardrails (also in CLAUDE.md)
- **Work on `main` only. Every push to `main` auto-deploys to Railway.** No feature branches.
- **Before every push:** `npx tsc --noEmit` AND a production build:
  `DATABASE_URL="postgresql://u:p@localhost:5432/db" NEXTAUTH_SECRET="build-only" npx next build`
  (dummy env is fine — the build only compiles; it doesn't hit the DB.)
- **Schema changes use versioned migrations** (`prisma/migrations/`), applied on deploy via `prisma migrate deploy` (in the `start` script). No DB is reachable from this container, so hand-write the migration SQL to match the schema, and run `npx prisma generate` so types update for tsc.
- Communication: numbered step-by-step, raw inline URLs, exact button names (see CLAUDE.md).

---

## Last session summary (2026-06-24)
All shipped to `main` and deployed. Newest → oldest:

**Jobs page (`/job-flow/jobs`)**
- Every cell in a job's row links to that job; the **Customer** name opens the **job** (not the customer page). `a4ac91b`
- Renamed **Client → Customer** and moved it right after **Job #**. `156620d`
- Added a **"Scheduled" date sort** (closest / farthest first). `84f4b44`

**Pick List (`/job-flow/pick-list`)**
- Added a **Phone** column after **Customer**; the customer phone also prints on the detail page header. `0cfdd2b`
- Customer-first columns + cleaner printouts. `a6419e1`

**Printing (global `@media print` in `src/app/globals.css`)**
- `@page { margin: 0.3in }` (top-level) → 0.25"+ margins on **every** page of **every** Print button. Pick-list cards (`.pick-list-row`) and table rows (`tr`) stay whole across page breaks; table `thead` repeats. `3dc6b92` `6ef226d` `c0ed33f`
- **Known trade-off:** real margins use the same strip Chrome puts the URL in. To print without the URL, untick **"Headers and footers"** in the print dialog's **More settings** (Chrome remembers it). CSS can't do both at once.

**Settings / account**
- Merged **My Account** (Profile + Change password) into the **Settings** page; removed the **"Admin" role label** from the header; `/account` redirects to `/settings`. Settings is now reachable by all roles, but the app-wide settings + Jobber section stay Admin/Manager-only, and the save actions enforce their own role check. The forced first-login `/account/change-password` page is untouched. GUEST can't change the shared demo password. `a02e4d5` `d0f64f0`

**Jobber sync — "deleted in Jobber" jobs + sync logs**
- Jobs deleted in Jobber are detected each sync and surfaced in a **post-sync pop-up** AND a permanent **`/job-flow/jobber/deleted`** review page. Delete returns inventory to stock (via shared `resetJobCore`) and removes the job; "stop showing" hides it. **Managers (WRITE_ROLES) can delete** these — the standalone hard-reset stays Admin-only. `36d7d08` `ccc48b7` `1ff0afb`
- **Sync logs** at **`/job-flow/jobber/logs`** ("View logs" button): every manual + scheduled sync for 30 days, per-run counts, error/warning levels, filters, job links, Clear button. `6923a52`
- Stale visits self-heal: a "visit not found" in the Notes phase removes the stale local visit instead of spamming errors. `37f3b3c`

**Inventory**
- **Non-stock service items**: `Item.tracksStock` flag. When off, the item is transparent to inventory — never deducted, never short, never "Awaiting Stock." Specialty Service + Lift Service are flagged by the migration. Marked via the "Track stock" checkbox on the item form; shows "Service" in the Items list; excluded from low-stock + materials-demand. `5e677e8`
- **Kits search box**. `2491dc6`

**Health checks:** ran multi-sub-agent audits twice (`1571539`, `31fecd5`, `d0f64f0`) — stock math + migrations passed clean; fixed concurrency (sync lock on delete), a bad-Jobber-response guard, role consistency, and the GUEST password footgun.

---

## Open items / to verify (ask the user)
- [ ] **Confirm Specialty Service + Lift Service show "Service"** in Inventory → Items (the migration flips them by exact name `Specialty Service` / `Lift Service`; if a name differs, uncheck "Track stock" on the item form). 
- [ ] Remind the user: to drop the **URL on printouts**, untick "Headers and footers" once in Chrome's print dialog.

## Known follow-ups / deferred (not urgent)
- **Prisma 7 config migration** — a deploy warning says `package.json#prisma` (the seed config) is deprecated and removed in Prisma 7. We're on Prisma 6; deferred to the eventual Prisma 7 upgrade so it's tested together. Not an error.
- Two benign deploy-log warnings (`npm warn config production`, the Prisma deprecation) — harmless, no action.

## Useful pointers
- Jobber sync core: `src/lib/jobber/sync.ts`, orchestrated by `src/lib/jobber/run-sync.ts` (manual + auto both record a `SyncRun`). Shared lock: `src/lib/jobber/sync-lock.ts`.
- Inventory math funnels through `src/lib/stock.ts` (`deductStock` / `adjustStock`, both respect `tracksStock`). Job reset logic: `src/lib/reset-job-core.ts` (plain module) wrapped by `src/lib/actions/reset-job.ts` (ADMIN) and `src/lib/actions/stale-jobs.ts` (WRITE_ROLES).
- Print rules: `src/app/(app)/...` pages use `<PrintButton />` + global `@media print` in `src/app/globals.css`.
