# Santa's Stock — Ideas Menu (brainstorm for review)

> A curated menu of candidate improvements, captured for review one at a time.
> Nothing here is committed — each idea, when chosen, gets its own focused plan
> (exploration → design → end-to-end test approach) before any code.

## Context

The app is a functionally complete Phase-1 system for a single Christmas-decor
franchise: Jobber-synced job flow, inventory items + kits, customer "totes"
that persist season-to-season, pick lists, calendar, dashboards, inspections,
dead-stock and replacement tracking. Two facts shape this menu:

1. **The schema was forward-designed.** Many capabilities are already modeled
   in Postgres but have no UI — "turn it on," not "build from scratch":
   lifecycle/retirement, ConditionGrade, photos, custom fields, MaintenanceTicket,
   structured LocationType, CustomerKitStatus.
2. **The Jobber integration is read-only and shallow.** We sync clients, jobs,
   line items, visits, notes, products — but ignore `jobCosting`, invoices,
   payments, expenses, timesheets, quotes, and `arrivalWindow`, and never write
   back. (`read_invoices` and `read_jobber_payments` scopes were enabled and a
   reconnect was done, so those are now accessible if/when we want them.)

---

## Tier 1 — Quick wins (small effort; mostly turn on dormant data)

**1.1 Photos on items, kits & inspections** ★ — Show `Item.photos[]` /
`Kit.photos[]` thumbnails on detail pages; let crew attach a photo when marking
a line DEAD/REPAIRED. Decor is visual; a photo beats a text reason. Builds on
existing photo arrays + the logo-upload plumbing as a pattern.
**Effort S–M · Impact High.** Risk: choose real object storage (Railway
volume/S3), not bytes-in-Postgres like the logo, before going wide.

**1.2 Surface job revenue you already sync** — `JobberJob.total` is stored but
unused; add a per-job revenue line + a "season booked revenue" rollup on the
dashboard. **Effort S · Impact Med.** Label it "booked," not "earned" (true
profit needs 3.2).

**1.3 Custom fields, surfaced** — Wire `CustomFieldDef`/`CustomFieldValue` +
`Item.customFields` into item/kit forms (text/number/select to start) so the
owner can add attributes like "bulb color temp" or "GFCI required."
**Effort M · Impact Med.**

**1.4 Condition grade on items** — Re-surface `ConditionGrade` (A/B/C/RETIRED)
on the item form + list with a filter; feed C-grade into replacement triage.
**Effort S · Impact Med.**

---

## Tier 2 — Operational power-ups (medium effort; faster crew, fewer errors)

**2.1 Teardown / removal (uninstall) flow** ★ — A post-season removal cycle:
generate a "what to bring back" removal pick list, confirm what physically
returned, route damage into inspection. **The single biggest domain gap — the
app models install but not teardown, yet the business does both, every unit,
every year.** Builds on the stage machine, `CustomerKit` totes, the inspection
flow, and `CustomerKitStatus.OUT_FOR_SEASON → IN_STORAGE` (a field that is
currently never flipped — strong sign this round-trip was always intended).
**Effort L · Impact High.** Also unblocks 3.4.

**2.2 Maintenance tickets, surfaced** — Build UI for the dormant
`MaintenanceTicket` model (status, description, photos, partsUsed,
laborMinutes); open one from an item or a REPAIRED inspection. Captures
off-season repair work that currently vanishes. **Effort M · Impact Med–High.**
Define the boundary vs. ReplacementQueue clearly ("needs deciding" vs. "being
fixed").

**2.3 Structured locations + QR labels** ★ — Activate the `LocationType` catalog
(WAREHOUSE/AISLE/RACK/BIN/VEHICLE) to replace free-text locations; print QR
labels for bins/totes; scan to pull up an item or confirm a tote. Biggest
warehouse-accuracy win. **Effort M · Impact High.** Migrate additively (keep
text as fallback). Prereq for 2.4.

**2.4 Truck loadout / staging checklist** — Per-day loadout grouped by truck
with check-off, using `LocationType.VEHICLE` as the current-location target so
inventory reflects what's on a truck. Prevents wasted return trips on install
day. **Effort M · Impact Med–High.** Best after 2.3 (can ship print-only first).

**2.5 Notifications for alerts you already compute** — The dashboard already
computes shortages, low-stock, and 7-day demand gaps but they're silent. Add
owner email digests ("Job #X has a shortage 2 days before install"). Reuses the
existing scheduler as the cron and `Client.emails[]`. **Effort M · Impact
Med–High.** Needs an email provider.

---

## Tier 3 — Intelligence & money (clone the dead-stock report pattern)

**3.1 Inventory valuation report** ★ — On-hand value (`quantity × unitCost`) by
product type and location, with season snapshots. Answers "what's the warehouse
worth?" for insurance/financing/tax. Clones `inventory/dead-stock/page.tsx`
almost wholesale. **Effort S–M · Impact High.** Risk: `unitCost` is nullable —
show an "unpriced items" count so the total is honest.

**3.2 Job & customer profitability** ★ — Pull unused Jobber `jobCosting`,
invoices, payments, expenses, and `timesheetEntries` (labor); combine with
internal materials cost (allocated items × `unitCost`) → true margin per job and
per customer. The "run the business" centerpiece. **Effort L · Impact High.**
Grows the GraphQL query cost (throttle) + needs new mirror tables; most
plumbing of any idea.

**3.3 Seasonal demand history & YoY forecast** ★ — Aggregate historical
`JobLineItem`/`KitItem` consumption by season → year-over-year trends and a
pre-season forecast ("last year you'd used 1,400 C9 bulbs by Dec 1; you have
900"). Extends the 7-day demand into a season view; buying happens in summer.
**Effort M–L · Impact High.** Ships valuable as plain YoY history first; needs
≥1 season of data.

**3.4 Retirement & lifecycle ROI** — Activate the dormant lifecycle block
(`seasonsDeployed`/`repairCount` vs. `retirementMaxSeasons`/`MaxRepairs`/
`ConditionFloor`) to flag end-of-life units and show cost-per-season.
**Effort M · Impact Med–High.** Depends on 2.1 (season increment) and 2.2
(repair increment) for real data — do it after those.

---

## Tier 4 — Next-level / ambitious (pick at most one to start)

**4.1 Jobber write-back** ★ — Move the integration from read-only to write: push
completion/change-orders back to Jobber and subscribe richer webhook topics
(QUOTE/INVOICE/PAYMENT/TIMESHEET). Eliminates daily double-entry; makes Santa's
Stock the operational source of truth. **Effort L · Impact High.** Largest blast
radius — a bad mutation corrupts the real Jobber account; needs idempotency +
dry-run + tight scoping.

**4.2 Field PWA / offline mode** — Installable phone-first app for crew:
pick-list check-off, photo, QR scan, inspection, with queued offline writes.
Installs happen on ladders with spotty signal. **Effort L · Impact High.**
Offline conflict resolution vs. the audited, double-click-safe stage machine is
genuinely hard — scope to reads + queued writes.

**4.3 Customer season portal** — Read-only per-customer link: tote contents,
install window (`arrivalWindow`), season recap with photos, "renew for next
season." A premium differentiator leaning on the recurring tote model.
**Effort L · Impact Med–High.** Introduces an external auth/security surface to
an internal-only app — confirm appetite first (CLAUDE.md says "no customer
portal" today).

**4.4 AI-assisted kit suggestions & purchasing plan** — Suggest kit recipes for
a new job from similar past customers, and generate a pre-season buy plan from
the forecast + retirements. **Effort L · Impact Med (high ceiling).** Strictly
depends on 3.3 + 3.4 — do not start here.

> Separate strategic track (not part of this menu): `SAAS_CONVERSION_ROADMAP.md`
> documents turning this into a multi-tenant product. That's a business
> decision, not a feature — flagged only so it's not forgotten.

---

## Recommended sequencing

**Wave 1 — fast, high-leverage, near-zero new infra:**
- 3.1 Inventory valuation (best impact-to-effort; clones an existing report)
- 1.1 Photos (small, high daily value; unblocks inspections/maintenance/portal)
- 1.2 Job revenue surfaced (trivial; data's already there)

**Wave 2 — the domain-defining gap and its payoff:**
- 2.1 Teardown/removal flow (makes January inventory real; unblocks 3.4)
- 2.3 Structured locations + QR (biggest accuracy win; prereq for truck loadout)

**Wave 3 — the strategic centerpiece (when there's appetite for an L):**
- 3.2 Job & customer profitability, paired with 3.3 seasonal forecasting (both
  are season-bucketed analytics over the same `JobLineItem` history)

**The one ambitious bet I'd pick:** 4.1 Jobber write-back — removes the owner's
daily double-entry rather than adding a new audience to serve. But it's a "when
the core is solid" move given the blast radius.

**Explicitly defer:** 4.4 (AI) and 3.4 (retirement ROI) until their data
dependencies exist — building them first yields empty or misleading output.

---

## Reference files (for whichever idea is picked first)
- `prisma/schema.prisma` — every dormant field already lives here.
- `src/lib/jobber/sync.ts` — where to add `jobCosting`/invoices/timesheets and richer webhook topics (3.2, 4.1).
- `src/app/(app)/inventory/dead-stock/page.tsx` — the analytics report pattern to clone (valuation 3.1, profitability/forecast 3.2/3.3).
- `src/lib/actions/inspection.ts` — the REPAIRED/DEAD logic that feeds maintenance tickets (2.2) and teardown damage (2.1).
- `src/lib/jobber/auto-sync-scheduler.ts` — the scheduler/cron pattern to reuse for notification digests (2.5).

---

## Currently in flight: "Billing Status" column on the Jobs list

A separate, smaller task was mid-discussion when this brainstorm was saved. Pick
it up next session by asking John these three questions and then implementing:

**The change:** on `/job-flow/jobs` (`src/app/(app)/job-flow/jobs/page.tsx`),
remove the **Property** column, add a **Billing Status** column in its slot
(values like "Upcoming" / "Awaiting payment" / "Paid"), rename the existing
**Status** header to **Visit Status**, and add a filter on Billing Status.

**Jobber-side confirmed during the prior session:**
- Job has **no single `billingStatus` enum**. The Jobber UI derives those labels
  from numeric fields on the Job (`invoicedTotal`, `total`, `jobBalanceTotals`).
- New scopes `read_invoices` and `read_jobber_payments` are already granted
  (reconnect was completed).
- Invoice has `invoiceStatus: InvoiceStatusTypeEnum!` — available if needed, but
  computing from Job-level numerics is the cleaner path.

**Open questions for John (resume here):**
1. **Visit Status rename** — (a) header-only relabel of the existing
   `Job.jobStatus` column, or (b) actually swap the data to show the most
   recent visit's `visitStatus`?
2. **`JobBalanceTotals` type fields** — need the field list from Jobber's
   GraphiQL Docs panel to write the Paid-vs-Awaiting-payment rule correctly.
3. **Filter UI placement** — (i) filter-bar dropdown alongside the existing
   Search/Stage/Customers controls (recommended; matches existing pattern), or
   (ii) column-header ▾ dropdown style (what John originally described).

**Proposed derivation once `JobBalanceTotals` is known** (will refine with
actual field names): `invoicedTotal === 0` → Upcoming; positive outstanding
balance → Awaiting payment; otherwise → Paid.
