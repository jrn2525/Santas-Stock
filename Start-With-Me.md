# Start-With-Me 🪧

**Read me first when picking up a new session.** I'm the running status/handoff doc for Santa's Stock — what we just did, what's pending, and what to verify. I complement `CLAUDE.md` (which has the project overview, the step-by-step communication style, the git workflow, and the known URLs — all auto-loaded each session, so I don't repeat them).

> **Maintenance:** update me at the end of each session — move finished items out, add new "Open items," and refresh "Last session."

_Last updated: 2026-07-01 (health-check pass)_

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

## Deep-dive health check (2026-07-01)
Ran four parallel review agents over the whole app (auth, inventory math, Jobber sync, data-integrity). Foundations verified solid: stock deduction is oversell-safe, `tracksStock` respected everywhere, migration↔schema parity, timezone/pagination/token-encryption/OAuth-CSRF all correct. Fixed and shipped to `main` + `claude/affectionate-knuth-2xK0h`:

- **Security:** `/api/inventory/export`, `/api/jobber/connect`, `/api/jobber/callback` authorized off the cached JWT role — now use `requireRole(ADMIN_ROLES)` (live DB role + `active`). Added a defense-in-depth guard to `/admin/overview`. `1c8dc41`
- **HIGH — sync wiped allocation state:** `syncJobs` delete-recreated every job's line items each run, resetting `isAllocated`/`kitsFromTote` and cascade-deleting shortages + inspection decisions (stock never restored → double-deduct on re-allocate). Now reconciles lines by Jobber line id (upsert Jobber-sourced fields, preserve allocation state, delete only removed Jobber lines, leave app-created lines). `562aaef`
- **HIGH — change order left stale shortages:** in-place line updates kept old `JobLineShortage` rows → under-restore on reset / over-deduct on Release. Now clears the job's shortages at the top of the txn and lets the netDiff pass recreate the real shortfall. `83fe12a`
- **HIGH — tote lookup inconsistent:** deactivate/inspection/change-order used a raw `customerKit.findFirst` (no property→client fallback) → silent tote corruption for multi-property customers. Routed through `findCustomerKit`. `4dd46ba`
- **MEDIUM — sync hardening:** 60s `AbortSignal.timeout` on Jobber fetches (a hung request no longer stalls all syncs behind the lock); the "returned too few jobs" false-delete guard now applies to accounts of any size (was gated at ≥20). `963d42a`

### Deferred (reported, NOT yet fixed — see below in Open items)
MEDIUM: deactivation uses un-ceiled qty (under-returns for fractional kit lines); `resetJob`/`deleteStaleJob` don't take the per-job lock. LOW: dead-stock shows service items; deactivation-report regex parse; dashboard week-count vs calendar mismatch; sync-logs "30 days" copy has no date filter; change-order audit-JSON undercount with duplicate lines; `firstCompletedAt` cross-job race; **`npm run lint` broken** (Next 16 dropped `next lint`, no `eslint.config.js`).

---

## Service Call jobs + Completed Jobs (2026-07-01)
All shipped to `main` and deployed.

**Service Call jobs + Completed Jobs**
- A job whose Pick List contains the labor-only **"Service Call"** item uses a 3-step **Service Call flow** card on the job page (`ServiceCallFlowCard`) instead of the normal Job Flow chart: **Service Call → Scheduled Service Call → Completed Service Call**. Step 1 always lit; step 2 lights up once the job has a visit with a **scheduled date** (synced from Jobber); step 3 via a **Mark Completed Service Call** button (Admin/Manager), with a **Reopen** to undo. `e38746b`
- Completing sets `JobberJob.serviceCallCompletedAt` → the job **leaves the Jobs list** and appears under a new **Completed Jobs** sidebar page (`/job-flow/completed-jobs`) — a Jobs-style checkbox list with a bulk **Delete selected** (confirm step). `e38746b`
- **Delete tombstones** the Jobber id (new `JobTombstone` table) so the Jobs **sync won't re-import** it while it still lives in Jobber. Service calls are labor-only, so there's no inventory to release. `e38746b`
- **Jobs list Stage column** shows the Service Call step ("Service Call" / "Scheduled Service Call") for service-call jobs instead of the normal stage. `47b4664`
- **Health-check fixes:** still surface **Awaiting Stock** on a service-call job if it's ever on hold (never hide a real shortage); hide the Admin **Reset job** button on service-call jobs (it doesn't apply to labor-only). `0ac5421`
- Service Call jobs are **excluded from the Job Flow board + Pick List** (labor-only — no allocation, nothing to pick) via `serviceCallJobWhere`, but **kept on the Calendar + Dashboard schedule** (a scheduled service call is real scheduled work the crew must see). `e1497a3`
- **Schema:** `JobberJob.serviceCallCompletedAt` + `JobTombstone`; migration `20260624000000_service_call` also flags a `Service Call` item non-stock. Detection is by the exact line name **"Service Call"** (case-insensitive at runtime).
- **Two review sub-agents audited the whole feature** — lifecycle, sync/tombstone integrity, delete FK-safety, migration, and permissions all passed with no HIGH/MEDIUM data bugs.

---

## Previous session (2026-06-24)
Shipped to `main` and deployed. Newest → oldest:

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
- [ ] **Deferred health-check fixes (user chose HIGH + key MEDIUM; these remain):**
  - MEDIUM — `deactivateJob` uses un-ceiled line qty (`deactivate.ts:~123`), diverging from the `Math.ceil` used at allocate/reset/complete → under-returns stock for any *fractional* kit line. Latent unless kit lines ever carry fractional qty from Jobber. Fix: `Math.ceil` consistently.
  - MEDIUM — `resetJob` (`reset-job.ts`) and `deleteStaleJob` (`stale-jobs.ts`) don't take `withJobLock` on the job (reset takes no lock; stale uses the *sync* lock) → a concurrent allocate/change-order on the same job could double-count. Low odds (single-user shop). Fix: wrap both in `withJobLock(jobId, …)`.
  - LOW — `npm run lint` is broken: Next 16 removed `next lint` and there's no `eslint.config.js`. Add a flat ESLint config (eslint-config-next flat) so lint runs again.
  - LOW (cosmetic) — dead-stock shows service items; deactivation-report regex parse; dashboard "this week" count vs Sun–Sat calendar; sync-logs "30 days" copy has no date filter; change-order audit-JSON undercounts duplicate-item lines; `firstCompletedAt` cross-job race.
- [ ] **Confirm the Jobber catalog item is named exactly `Service Call`** (capital S/C) so the migration's non-stock flag matched it. The Service Call *flow* works regardless of casing (runtime detection is case-insensitive); only the `tracksStock=false` UPDATE is exact-case — and since service calls never run allocation, it's belt-and-suspenders.
- [ ] Heads-up for the user: **deleting a Completed Job is permanent** (tombstoned so sync won't re-import). If one is ever needed back, it takes a manual delete of the `JobTombstone` row in the DB.
- [ ] Decision revisit if wanted: Service Call jobs are currently **kept on the Calendar + Dashboard schedule**. Offered to hide them there too — user can ask if they change their mind.
- [ ] **Confirm Specialty Service + Lift Service show "Service"** in Inventory → Items (the migration flips them by exact name `Specialty Service` / `Lift Service`; if a name differs, uncheck "Track stock" on the item form). 
- [ ] Remind the user: to drop the **URL on printouts**, untick "Headers and footers" once in Chrome's print dialog.

## Known follow-ups / deferred (not urgent)
- **Prisma 7 config migration** — a deploy warning says `package.json#prisma` (the seed config) is deprecated and removed in Prisma 7. We're on Prisma 6; deferred to the eventual Prisma 7 upgrade so it's tested together. Not an error.
- Two benign deploy-log warnings (`npm warn config production`, the Prisma deprecation) — harmless, no action.

## Useful pointers
- **Service Call feature:** detection helper + `serviceCallJobWhere` (Prisma `where` fragment to exclude them) in `src/lib/service-call.ts`; complete/reopen/delete actions in `src/lib/actions/service-call.ts`; the card `src/components/job-flow/service-call-flow-card.tsx`; Completed Jobs page `src/app/(app)/job-flow/completed-jobs/` + `src/components/job-flow/completed-jobs-list.tsx`. Sync skips tombstoned ids in `src/lib/jobber/sync.ts` (tombstone loaded before the pagination loop).
- **Env gotcha (rebuilds):** the web container can wipe `node_modules` between sessions. If `npm ci` succeeds but the **Prisma engine download gets reset by the egress proxy** (`ECONNRESET`/`aborted` on `binaries.prisma.sh`), run `npm ci --ignore-scripts`, then `curl --retry 6 --retry-all-errors` the `libquery_engine.so.node.gz` and `schema-engine.gz` for `debian-openssl-3.0.x` (commit hash = `@prisma/engines-version`), gunzip them into **both** `node_modules/prisma/` and `node_modules/@prisma/engines/`, then `npx prisma generate`. curl retries harder than Prisma's fetcher, which is what makes it work.
- Jobber sync core: `src/lib/jobber/sync.ts`, orchestrated by `src/lib/jobber/run-sync.ts` (manual + auto both record a `SyncRun`). Shared lock: `src/lib/jobber/sync-lock.ts`.
- Inventory math funnels through `src/lib/stock.ts` (`deductStock` / `adjustStock`, both respect `tracksStock`). Job reset logic: `src/lib/reset-job-core.ts` (plain module) wrapped by `src/lib/actions/reset-job.ts` (ADMIN) and `src/lib/actions/stale-jobs.ts` (WRITE_ROLES).
- Print rules: `src/app/(app)/...` pages use `<PrintButton />` + global `@media print` in `src/app/globals.css`.
