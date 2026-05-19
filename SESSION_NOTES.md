# Session notes — 2026-05-19

Handoff document so the next session can pick up where this one left off. Read this top-to-bottom on a fresh start.

## Where we are

The app is live on Railway. The branch is `claude/railway-docs-lookup-mm7zM`. Last pushed commit is `1721ccb`. All schema migrations referenced in this doc have been applied to the Railway Postgres.

The session moved Santa's Stock from "Items/Kits CRUD with a CSV import" to a Jobber-integrated workflow where Jobber owns the catalog and Job Flow data, and Santa's Stock owns the operational fields (quantity, locations, websites, kit recipes).

## What's working today

### Items and Kits
- Items have the full Jobber-style field set: SKU, manufacturer, model, product type, status (AVAILABLE/ALLOCATED), quantity, active, home/current location, unit cost, vendor websites (string[]).
- Kits mirror the same shape plus a recipe of Items with quantities.
- Item form has a read-only "Category = Product" display and an Active checkbox.
- Kit form has a read-only "Category = Service" display, a searchable typeahead (datalist) for picking Items into the recipe, and an "+ Add another item" button (no fixed cap).
- The Edit links on the Items / Kits list pages point to the right paths (`/inventory/items/[id]/edit` and `/inventory/kits/[id]/edit`).
- Vendor Websites: each Item has a list of vendor URLs with `+ Add another vendor website` / `Remove` buttons in the form. Round-trips through `Website 1, Website 2, ...` CSV columns.

### CSV Import / Export
- Lives under Admin sidebar only.
- Recognized columns: `Name, Description, Category, Unit Cost, SKU, Manufacturer, Model, Product Type, Status, Quantity, Active, Home Location, Current Location` plus `Website N` (for Items) and `Item N` / `Item N Qty` pairs (for Kits).
- `Category = Product` routes to Item table; `Category = Service` routes to Kit table.
- Two-pass import: Items first, then Kits. Item-by-name lookups for Kit sub-items happen after the Items pass, so a single CSV file with both rows ordered Kits-first-then-Products works fine.
- Performance: pre-loads existing name maps in two queries and processes rows in parallel batches of 5. ~10s for a 460-row CSV instead of 60+.
- Caught errors log to stderr with `[csv-import]` prefix in Railway logs.
- Export writes the same shape; column count auto-expands to fit the widest Item's websites and the widest Kit's items.

### Jobber integration

#### OAuth + GraphQL client
- `src/lib/jobber/oauth.ts` and `src/lib/jobber/client.ts` handle the OAuth flow, token refresh (refreshes when <5 min to expiry), and `jobberQuery<T>()` helper. API version pinned to `2025-04-16`.
- Connect / disconnect lives on `/job-flow/jobber`.

#### Inventory ↔ Jobber (Products & Services)
- `/inventory/jobber` page has the "Sync now" button.
- `syncProductsAndServices()` in `src/lib/jobber/sync.ts` pages through Jobber's `productOrServices` connection, routes PRODUCT to Item and SERVICE to Kit.
- Matching by `jobberProductId` first, then claim-by-name fallback with normalized names (trim, lowercase, collapse whitespace) so CSV-imported rows get linked on first sync.
- Jobber owns Name / Description / Unit Cost. The sync only writes those three fields plus jobberProductId. Everything else on Item/Kit is Santa's Stock-only and never touched.
- The sync result UI shows `createdItemNames` and `createdKitNames` so the user can spot unexpected new rows that should have matched something.

#### Job Flow ↔ Jobber (Customers, Jobs, Visits, Notes)
- `/job-flow/jobber` page has separate Sync Now buttons for:
  - Customers (existing — pre-session)
  - Jobs
  - Visits
  - Notes
- Recommended sync order on a fresh setup: Customers → Jobs → Visits → Notes.
- Jobs sync also pulls line items inline (the `lineItems` connection in the Jobs GraphQL query). Each line item is resolved to a local Item or Kit by `productOrService.id`; unresolvable references fall back to `rawName`.
- Notes are polymorphic — a `JobberNote` belongs to one of Client, JobberJob, or JobberVisit. Sync iterates each entity (concurrency 4) and pulls its `notes` connection.

#### Locked fields (Name / Description / Unit Cost)
- On every existing Item and Kit, those three fields render read-only with a small banner. Server actions also override any submitted values with the current DB values, so a curl call can't bypass the UI.
- Newly-created rows still allow editing those fields (so you can seed manually-created Items/Kits).

### Job detail and Pick List
- New page `/job-flow/jobs/[id]` shows four sections for one Job:
  1. Customer (name, emails, phones, service address)
  2. Calendar (the visits)
  3. Notes (job-level + customer-level, side by side)
  4. Pick List (line items with Kit recipe expansion)
- Pick List displays each Kit with either `Pre-built in stock` (Kit.quantity > 0) or `Build from recipe`, and an expandable recipe showing each component Item × (line qty × per-kit qty).
- The Jobs list page links each row to the detail page.

### Calendar
- `/job-flow/calendar` now shows visits grouped by day (last 30 days plus future), with a Today highlight. No real grid widget yet — that's deferred.

### Role-based access
| | ADMIN | MANAGER | Crew (USER) |
|---|---|---|---|
| Job Flow tab + sub-pages | yes | yes | yes (no Jobber) |
| Inventory tab + sub-pages | yes | yes | yes (no Jobber) |
| Admin tab | yes | no | no |
| Import / Export | yes (under Admin only) | no | no |
| Inventory → Jobber | yes | yes | no |
| Job Flow → Jobber | yes | yes | no |

Crew sees no Admin tab and no Jobber link in either Inventory or Job Flow sidebars. Import / Export lives ONLY under Admin. The Admin sidebar contains Overview, Users, Import / Export (Jobber sync was removed from Admin since it lives in Inventory and Job Flow). NavItem switched from a binary `adminOnly` flag to an explicit `visibleTo: Role[]` list.

Page-level guards (`requireRole`) match the matrix: `/admin/*` is `ADMIN_ROLES`, `/inventory/jobber` and `/job-flow/jobber` are `WRITE_ROLES` (ADMIN + MANAGER), `/inventory/import-export` is `requireRole("ADMIN")`.

## Schema state

All migrations have been applied via raw SQL in the Railway Data tab. Migrations were NOT created in `prisma/migrations/` — they were applied directly. The `schema.prisma` file is the source of truth for what should exist.

Models added or extended in this session:

- **Item**: added `active`, `websites String[]`, `jobberProductId String? @unique`.
- **Kit**: added `sku, manufacturer, model, productType, quantity, currentLocation, jobberProductId`. Changed `status` from `KitStatus` to `ItemStatus` (the old enum still exists but is unused).
- **JobberJob**: added `title, jobNumber, description, instructions, total, startAt, endAt, syncedAt`, plus `lineItems` and `notes` relations.
- **JobberVisit**: added `title, instructions, syncedAt`, plus `notes` relation.
- **JobberNote** (new): polymorphic, links to Client / JobberJob / JobberVisit. Fields: `jobberNoteId, body, isInternal, noteCreatedAt, syncedAt`.
- **JobLineItem** (new): links a JobberJob to either an Item or a Kit with a quantity, position, optional notes. Has `jobberLineItemId` unique key. On Cascade-delete from Job.
- **Client**: gained reverse relation to JobberNote.

## Recent commits (chronological)

```
99cc2e4 Items/Kits expansion: 13-field form + 25-column CSV round-trip
3a7d2eb Add Item.websites: list of vendor URLs per Item
47f81a8 Speed up CSV import: parallel batches + bulk pre-load
d780db4 Move ImportSummary type/default out of "use server" file
15772c3 Fix Edit links on Items/Kits lists to include /inventory prefix
b2a8888 Add Jobber Products/Services sync into Items and Kits
8581483 Make Jobber claim-by-name drift-tolerant + show created rows
b887f51 Lock Jobber-owned fields on linked Items and Kits
a2d947e Restrict Admin role to Admin-only nav (REVERTED)
c9f9bed Restore Admin full access: show Job Flow / Inventory / Admin tabs
a34dc8c Role-based access: Admin tab ADMIN-only, Jobber for ADMIN+MANAGER
9dd6dab Wire Job Flow to Jobber: sync Jobs, Visits, and Notes
639aca5 Lock Name / Description / Unit Cost on every existing Item and Kit
1721ccb Job detail page + line item sync from Jobber
```

## Open questions / known risks

1. **Jobber GraphQL field names**. The queries in `src/lib/jobber/sync.ts` were written from a best-guess of the Jobber `2025-04-16` schema. If any field name is wrong, the sync will fail with a "Jobber GraphQL error" message in the warnings list. Suspects to verify if anything misbehaves on the first sync next session:
   - `productOrServices` connection name and `category`, `defaultUnitCost`, `internalUnitCost` field names
   - `jobs.lineItems.nodes[].productOrService.id` — whether this path exists for linking line items back to a Product/Service
   - `client.notes`, `job.notes`, `visit.notes` — whether top-level `notes` exists, or whether note bodies are called `message` / `body` / `content`
   - `EncodedId` scalar — used in the Notes per-parent queries; if Jobber uses `ID!` instead, change the GraphQL `$id: EncodedId!` to `$id: ID!`
2. **Calendar is a list, not a grid**. The proper week/month grid view is deferred. Today's implementation is "visits grouped by day".
3. **Notes viewer**. Notes sync into the DB and are displayed on Job detail pages (job-level + customer-level). There's no standalone Notes page or Customer detail page yet — Customer-level notes only show up in the context of a Job. If the user wants a Customer detail page that surfaces notes without going through a Job, that's a future step.
4. **Pick List smartness**. The Pick List currently displays every Kit's recipe expandably with a static "pre-built in stock" / "build from recipe" badge based on `Kit.quantity`. It does not yet account for Allocations (i.e., Kits already reserved for other Visits). A real "what's actually available" calculation needs Allocation logic, which hasn't been wired up.
5. **Global Pick List page**. `/job-flow/pick-list` is still a stub. The per-Job Pick List works; the warehouse-worksheet aggregating across multiple jobs in a date range hasn't been built.
6. **KitStatus enum** still exists in the Prisma schema but is unused. Could be dropped later for cleanliness.

## How to pick up next session

1. **Start by reading this file.** Then `git log --oneline -20` to see the recent commits.
2. **Verify state on Railway.** Sign in as Admin. Confirm:
   - You can see Job Flow / Inventory / Admin tabs
   - `/inventory/items` and `/inventory/kits` load with rows
   - `/job-flow/jobs/[any-id]` loads with Customer / Calendar / Notes / Pick List sections
3. **If a fresh Jobber sync is needed**, run in this order on `/job-flow/jobber`: Customers → Jobs → Visits → Notes. Then `/inventory/jobber` Sync now.
4. **Likely next chunks** (priority order, but ask the user):
   - Customer detail page (a per-customer hub showing their Jobs, Properties, Notes)
   - Global Pick List page at `/job-flow/pick-list` aggregating today's / this week's picks
   - Real-time webhooks from Jobber (replaces manual Sync buttons)
   - Job Flows page — the graphical stages-and-checklists editor (the user said this ships last)
   - Allocation tracking — reserving Items/Kits to a specific Visit so the Pick List can show real availability
5. **If a Jobber sync fails with a GraphQL error**, paste the error to the next session. The fix is almost always adjusting one or two field names in `src/lib/jobber/sync.ts`.

## File locations cheat sheet

- Sync logic: `src/lib/jobber/sync.ts`
- Sync server actions: `src/lib/actions/jobber.ts`
- Sync buttons: `src/components/jobber-sync-button.tsx`, `inventory-sync-button.tsx`, `jobber-job-flow-sync-buttons.tsx`
- Item form: `src/components/item-form.tsx`
- Kit form: `src/components/kit-form.tsx`
- CSV import action: `src/lib/actions/inventory-import.ts`
- CSV export route: `src/app/api/inventory/export/route.ts`
- Job detail: `src/app/(app)/job-flow/jobs/[id]/page.tsx`
- Calendar: `src/app/(app)/job-flow/calendar/page.tsx`
- Sidebar: `src/components/sidebar.tsx`
- Top tabs: `src/components/workspace-tabs.tsx`
- Role helpers: `src/lib/auth-helpers.ts`
- Schema: `prisma/schema.prisma`
