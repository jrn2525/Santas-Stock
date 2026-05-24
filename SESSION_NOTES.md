# Session notes — 2026-05-19 (end of day)

> **HISTORICAL — superseded by `SESSION_NOTES_2026-05-23.md`.** This was the
> first handoff doc. Everything described as "pending" below (notably the
> `Item.minQuantity` `db:push` step) was applied long ago, and the project has
> since moved off `prisma db push` onto versioned migrations. Kept for history;
> do not act on the deploy steps here.

Single handoff document for picking up in another session. Read top-to-bottom.

## Where we are

- **Branch**: `claude/railway-docs-lookup-mm7zM`
- **Last pushed commit**: `01f5ada` ("Build useful Dashboards")
- The app is deployed on Railway. All prior schema changes were applied via the Railway Postgres Data tab.
- **One pending schema change** as of end-of-day: `Item.minQuantity Int @default(0)`. **You must run `npm run db:push` against the prod DB before the Inventory dashboard will load and before saving an Item will succeed.** See "Pending deploy step" below.

The app moved today from a Jobber-integrated app with separate sync buttons and a bare calendar to a full operational dashboard with a single one-click sync cascade, a real Month/Week/Day calendar in Eastern Time, selectable-and-printable notes on Job pages, and dashboards that bridge upcoming jobs with inventory stock to highlight shortages.

## Pending deploy step

The schema gained `Item.minQuantity Int @default(0)`. There is no migration file (this project uses `prisma db push`). Apply it once:

```bash
# From a Railway shell, or from local with the prod DATABASE_URL exported:
npm run db:push
```

Until that runs:
- `/job-flow/dashboard` works (doesn't query minQuantity).
- `/inventory/dashboard` will 500.
- Editing/creating an Item will fail because Prisma writes the new column.

Future-proofing suggestion (not done): set Railway's release command to `npx prisma db push` so schema changes auto-apply on deploy.

## What's working end of day

### Dashboards (NEW today, late session)

**`/job-flow/dashboard`** — replaces the "coming soon" placeholder.
- Stat strip (4 cards, each linking somewhere): Today's visits · This week's visits · Jobs this week · Recent notes (7d).
- **Data freshness** card with `Last sync: N min ago` + the cascade Sync Now button.
- **Today** widget: today's visits as a list with customer name + time window + address. Click row → Job detail.
- **This week** widget: 7-day bar strip (visit counts). Click a day → Calendar Day view.
- **Materials needed this week**: aggregates every line item across jobs that have a visit in the next 7 days. Kits are expanded into their component items via `kit.items[]`. Sorted by demand qty.
- **Shortages** sub-panel (red, only when needed > on-hand): per item, `Need X, have Y, short Z`. Each row links to the Item detail.
- **Recent notes (last 7d)**: notes from any parent (Client / Job / Visit), clickable when the parent or its visit is on a Job.

**`/inventory/dashboard`** — was 4 stat cards + a debug DB ping. Now:
- Stat cards stay (DB ping removed).
- **Low stock** panel: items where `quantity <= minQuantity AND minQuantity > 0`. Items with minQuantity=0 are excluded (alert is opt-in per item).
- **Short for this week** panel: same shortages logic as the Job Flow dashboard, surfaced for inventory staff.

### Calendar (NEW today, mid-late session)

`/job-flow/calendar` is a real calendar now.

- **Three views**: Month (6×7 grid), Week (7 day cols × 14 hour rows, 7 AM–9 PM), Day (single hour column).
- **Toolbar**: prev / Today / next nav · Month/Week/Day picker · period label · Print button.
- **URL state**: `?view=month|week|day&date=YYYY-MM-DD`. Default `view=week&date=today`. Shareable/refreshable.
- **Eastern Time everywhere**: via `Intl.DateTimeFormat({ timeZone: "America/New_York" })`. DST handled automatically by Intl — no manual offset math.
- **All-day detection**: visits at ET-midnight are rendered as "All day" instead of the old "12:00 AM – 11:59 PM" misleading display (which was the source of "4 AM – 3:59 AM" weirdness from server-timezone formatting).
- **Click a visit block** → opens that Job (`/job-flow/jobs/[id]`).
- **Click a day number** in Month view → switches to Day view for that date.
- **Click a day header** in Week view → switches to Day view.
- **Today** is highlighted with brand-tint background + red day number.
- **Print**: hides app chrome + toolbar via `no-print`. Shows period label heading. Prints current view only.

**Known limits (intentional for v1)**:
- Hour grid fixed at 7 AM – 9 PM. Visits outside this range clamp to the edges.
- Overlapping visits stack on top of each other; no side-by-side splitting.
- Multi-day visits only render on their start date.

### Notes (REFACTORED late session)

- The Notes section is **now on the Job detail page**, not the Pick List page.
- Notes have per-row **checkboxes**. Uncheck a note → it gets the `note-unchecked` class → CSS rule hides it from printouts.
- **Job detail page also pulls visit-level notes** for any visit attached to the job. (Earlier bug: notes synced into the DB with `visitId` were invisible because the page only queried `jobId` + `clientId`. Fixed in commit `0355771`.)
- The Pick List page no longer queries or renders notes.
- The selectable-notes component is `src/components/job-notes.tsx` (was `pick-list-notes.tsx`).

### Print buttons (CONSOLIDATED late session)

- Generic component: `src/components/print-button.tsx` (`<PrintButton />`).
- Used by:
  - Calendar toolbar (top-right area).
  - Job detail page header (top-left, above breadcrumb).
  - Pick List detail page header (top-left, above breadcrumb).

### Sync (CASCADE, mid-late session)

- The old Customer sync section on `/job-flow/jobber` is removed.
- `/job-flow/jobber` now has a single sync button: **Customers → Jobs → Visits → Notes** in that order. Each phase only runs if prior phase succeeded.
- Same button used on the Job Flow Dashboard data-freshness card.
- Result summary line: `✓ Customers 603 upserted · Jobs N upserted/skipped · Visits N upserted/skipped · Notes N upserted/skipped`.
- Removed action `syncJobberCustomers` from `src/lib/actions/jobber.ts` — `syncJobberJobs` is the cascade.
- Removed component `jobber-sync-button.tsx`.

### Customers UI (REMOVED mid-session)

- The `/job-flow/customers` index and `/job-flow/customers/[id]` pages are deleted.
- Customers nav item removed from sidebar.
- Customer data is still synced (it's the first phase of the cascade), and still visible inside Job detail's Customer card. There's just no dedicated browse page.

### Per-job Pick List (early session — pre-existing, but worth noting)

`/job-flow/pick-list` is the index, `/job-flow/pick-list/[id]` is per-job.
- Lists Kits (with recipe components × line qty), Items, and Unresolved line items.
- Has a top-left Print button (added today).
- Notes panel was removed today (moved to Job page).

### Items & Item form

- New field `minQuantity Int @default(0)` on `Item` schema (needs db:push).
- Item form has a new "Min quantity" input next to "Quantity" with help "Low-stock alert when at or below this number. 0 to disable."
- Server action `src/lib/actions/items.ts` reads, validates, and persists the field.

### Everything from earlier today (still works)

These were built in the morning/midday session before this handoff. Still functioning:
- Items, Kits, full CSV import/export, Vendor websites
- Jobber OAuth + GraphQL client (`src/lib/jobber/`)
- Inventory ↔ Jobber sync (Products → Items, Services → Kits) at `/inventory/jobber`
- Job Flow ↔ Jobber cascade sync (Customers + Jobs + Visits + Notes) at `/job-flow/jobber`
- Locked Jobber-owned fields (Name / Description / Unit Cost) on linked rows
- Job detail page `/job-flow/jobs/[id]`: Customer + Calendar + Notes + Pick List + Details
- Role-based access matrix (Admin/Manager/Crew)

## Schema state

Applied to Railway prod (via SQL in the Data tab — no `prisma/migrations/` directory):
- **Item**: `active`, `websites String[]`, `jobberProductId String? @unique`.
- **Kit**: `sku`, `manufacturer`, `model`, `productType`, `quantity`, `currentLocation`, `jobberProductId`. `status` switched from `KitStatus` to `ItemStatus`.
- **JobberJob**: `title`, `jobNumber`, `description`, `instructions`, `total`, `startAt`, `endAt`, `syncedAt`, plus `lineItems` and `notes` relations.
- **JobberVisit**: `title`, `instructions`, `syncedAt`, plus `notes` relation.
- **JobberNote** (created earlier today): polymorphic, links to Client / JobberJob / JobberVisit. `jobberNoteId String @unique`, `body`, `isInternal`, `noteCreatedAt`, `syncedAt`.
- **JobLineItem**: links a Job to an Item or Kit with `quantity`, `position`, optional `notes`. `jobberLineItemId String @unique`.
- **Client**: gained reverse relation to `JobberNote`.

**NOT yet applied to Railway prod**:
- **Item.minQuantity Int @default(0)** ← run `npm run db:push` to apply.

## All commits today (newest first)

```
01f5ada Build useful Dashboards: schedule, week strip, materials, shortages, low stock
0355771 Surface visit-level notes on the Job detail page
05c6734 Move Notes from Pick List to Job detail; add top-left Print buttons
faffea9 Real Calendar: Month/Week/Day views, ET timezone, click-to-job, print
f075a98 Cascade Customers into Jobs sync; remove standalone Customers UI
3ddbb4b Build per-job Pick List with checkable notes and print stylesheet
dab0b09 Bump font scale: xs/sm/base = 16px, lg = 20px
4ef399e All text inside card panels renders white
2ef5cac Revert card panels to dark; drop dark-text overrides
fbd146f Revert sign-in logo to 320px and form container to max-w-md
742e5d3 Double sign-in logo size again (640px) and widen form container
e484c08 Double sign-in logo size
0cfc202 Lighten card panels and force dark text inside for readability
7b2c7fd Introspect JobNoteUnion to build job/visit note queries; retry 5xx
b999313 Cascade Sync Jobs into Visits and Notes; remove standalone buttons
00e9e67 Fix Jobs sync: coerce numeric jobNumber to string before trim
974b3f7 Customer detail page: contact, properties, jobs, notes (REMOVED later in f075a98)
e5fd1bb Make Jobber throttle handling cost-aware + pace large syncs
9f778d0 Fix Jobs sync GraphQL errors and add throttle retry
4916b41 Add SESSION_NOTES.md to capture today's progress for next-session handoff
1721ccb Job detail page + line item sync from Jobber
639aca5 Lock Name / Description / Unit Cost on every existing Item and Kit
9dd6dab Wire Job Flow to Jobber: sync Jobs, Visits, and Notes
a34dc8c Role-based access: Admin tab ADMIN-only, Jobber for ADMIN+MANAGER
b887f51 Lock Jobber-owned fields on linked Items and Kits
8581483 Make Jobber claim-by-name drift-tolerant + show created rows
b2a8888 Add Jobber Products/Services sync into Items and Kits
15772c3 Fix Edit links on Items/Kits lists to include /inventory prefix
d780db4 Move ImportSummary type/default out of "use server" file
47f81a8 Speed up CSV import: parallel batches + bulk pre-load
3a7d2eb Add Item.websites: list of vendor URLs per Item
99cc2e4 Expand Item + Kit forms and CSV round-trip to full 25-column schema
93feb5b Add Inventory CSV export: Items, Kits, or Both
bf20345 Add Inventory CSV import: route Service→Kit, Product→Item
```

(A few revert/cleanup commits omitted: `c9f9bed`, `a2d947e` — role restriction back-and-forth.)

## Open questions / known risks

1. **`Item.minQuantity` schema change is unapplied**. Run `npm run db:push` first thing.
2. **Calendar overlap**: two visits at the same time stack on top of each other in Week/Day view. If your customer schedules concurrent visits, you'll only see the top one. Future: side-by-side splitting.
3. **Calendar hour range**: hard-coded 7 AM – 9 PM. Visits outside clamp to the edges. Make configurable if real schedule extends beyond.
4. **Materials demand assumes whole-job consumption**: when a job has multiple visits in the same week, its line items are counted once (correct). But if a job spans multiple weeks, the dashboard shows its full materials in every week the job appears. Acceptable for v1; consider per-visit allocations later.
5. **Customer-only notes** show up in the Job Flow Dashboard's "Recent notes" panel with no clickable destination (Customer detail page was removed). They render as `Customer: NAME` plain text. If you want a customer landing page back, that's a future step.
6. **No webhook integration yet**. Sync is manual via the cascade button. Real-time Jobber webhooks are not wired up.
7. **Global Pick List** (`/job-flow/pick-list` index) is still a stub. Per-job Pick List works.
8. **Allocation tracking** doesn't exist. The Pick List shows a Kit as "Pre-built in stock" or "Build from recipe" based on `Kit.quantity` alone — it does not subtract kits already reserved to other visits.

## How to pick up next session

1. **Read this file.** Then `git log --oneline -20`.
2. **Run `npm run db:push`** if you haven't yet. Then verify `/inventory/dashboard` and item-editing both work.
3. **Sign in and smoke-test**:
   - `/job-flow/dashboard` loads with today's visits, this week strip, materials needed.
   - `/job-flow/calendar` defaults to Week view, Today highlighted, click visit → Job.
   - `/job-flow/jobs/[any-id]` shows Print button top-left, Customer/Calendar/Notes/Pick List, checkboxes on notes.
   - `/inventory/dashboard` shows stat cards + Low Stock + Short for this week.
4. **Likely next chunks** (priority order — ask the user):
   - Global Pick List at `/job-flow/pick-list` aggregating today's / this week's picks across all jobs.
   - Real-time webhooks from Jobber (replace manual sync).
   - Allocation tracking so the Pick List knows what's reserved vs available.
   - Customer detail page (only if the user misses it after the cascade refactor).
   - Job Flows page — the graphical stages-and-checklists editor (user said this ships last).
   - Calendar polish: side-by-side overlapping visits, configurable hour range, color-by-status, multi-day bars in month view.

## File locations cheat sheet

- **Date/time helpers**: `src/lib/datetime.ts` (ET timezone, week/month math)
- **Sync logic**: `src/lib/jobber/sync.ts`
- **Sync server actions**: `src/lib/actions/jobber.ts` (cascade in `syncJobberJobs`)
- **Item action**: `src/lib/actions/items.ts`
- **Sync buttons**: `src/components/jobber-job-flow-sync-buttons.tsx` (cascade), `inventory-sync-button.tsx` (inventory)
- **Print button**: `src/components/print-button.tsx`
- **Job notes (selectable+print)**: `src/components/job-notes.tsx`
- **Calendar views**: `src/components/calendar-{toolbar,month-view,week-view,day-view,types,print-button}.tsx`
- **Item form**: `src/components/item-form.tsx`
- **Kit form**: `src/components/kit-form.tsx`
- **CSV import action**: `src/lib/actions/inventory-import.ts`
- **CSV export route**: `src/app/api/inventory/export/route.ts`
- **Job Flow Dashboard**: `src/app/(app)/job-flow/dashboard/page.tsx`
- **Inventory Dashboard**: `src/app/(app)/inventory/dashboard/page.tsx`
- **Calendar page**: `src/app/(app)/job-flow/calendar/page.tsx`
- **Job detail**: `src/app/(app)/job-flow/jobs/[id]/page.tsx`
- **Pick List per-job**: `src/app/(app)/job-flow/pick-list/[id]/page.tsx`
- **Sidebar**: `src/components/sidebar.tsx`
- **Top tabs**: `src/components/workspace-tabs.tsx`
- **Role helpers**: `src/lib/auth-helpers.ts`
- **Schema**: `prisma/schema.prisma`
