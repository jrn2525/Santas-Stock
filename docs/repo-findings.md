# Repo findings — Santa's Stock

Answers to eight questions about this codebase, read from the code on
2026-09-01. Every claim below cites the file it came from. Where the code does
not answer a question, the answer is **unknown** rather than a guess.

No secrets, tokens, keys, or client IDs appear in this document, and no `.env`
contents were read or reproduced. Credentials are referenced only by the name
of the environment variable that holds them.

---

## 1. How is the Jobber OAuth token stored, and how is refresh handled?

**Storage** — `prisma/schema.prisma` (`JobberConnection`), `src/lib/crypto.ts`

- A single row in the `JobberConnection` table holds `accessToken`,
  `refreshToken`, `expiresAt`, `scopes`, `jobberAccountId`, `accountName`, and
  who connected it. Single-tenant is enforced by a `singleton` column with a
  unique constraint, so a second row cannot be inserted.
- Both tokens are **encrypted at rest** with AES-256-GCM (random 96-bit IV per
  value, plus an auth tag), stored as `enc:v1:<iv>:<tag>:<ciphertext>` in
  base64 (`src/lib/crypto.ts`).
- The encryption key is derived via SHA-256 from the `TOKEN_ENCRYPTION_KEY`
  environment variable, falling back to `AUTH_SECRET`. Rotating either
  invalidates existing ciphertext, which requires reconnecting Jobber.
- `decryptSecret` passes through any value lacking the `enc:v1:` prefix, so
  pre-encryption plaintext rows keep working until the next write re-encrypts
  them.
- Plaintext tokens exist only server-side inside `src/lib/jobber/*`. No page or
  client component references the token fields.

**Refresh** — `src/lib/jobber/client.ts`, `src/lib/jobber/oauth.ts`

- `getValidAccessToken()` refreshes when the token is within
  `REFRESH_THRESHOLD_MS` (5 minutes) of `expiresAt`; otherwise it decrypts and
  returns the stored access token.
- Jobber **rotates the refresh token on every use**, so concurrent refreshes
  would invalidate each other. All concurrent refreshes are coalesced onto one
  in-flight promise (`refreshInFlight`), with the check-and-set done
  synchronously so only the first caller starts the refresh.
- Inside that single-flight, `refreshAndStore()` re-checks expiry first, so a
  caller holding a stale "expiring" snapshot does not spend an
  already-rotated refresh token.
- The refresh calls `POST https://api.getjobber.com/api/oauth/token` with
  `grant_type=refresh_token` plus the `JOBBER_CLIENT_ID` / `JOBBER_CLIENT_SECRET`
  environment variables (values not reproduced here), then writes back the new
  access token, new refresh token, expiry, and scopes — re-encrypted.
- Expiry comes from the `expires_in` response field, or is decoded from the
  access token's JWT `exp` claim as a fallback (`computeTokenExpiry`).

---

## 2. What does this repo currently pull from Jobber, and on what schedule?

**What it pulls** — `src/lib/jobber/sync.ts`, `src/lib/jobber/run-sync.ts`

The Job Flow sync (`doFullSync`) runs five phases in this fixed order, each
isolated so one phase failing does not abort the rest:

| # | Phase | Pulls |
|---|-------|-------|
| 1 | Customers + Properties | `clients`: id, firstName, lastName, companyName, emails, phones, and nested `properties` with street/city/province/postalCode/country |
| 2 | Jobs | `jobs`: id, jobNumber, title, instructions, total, start/end, client, property, status, **and nested `lineItems`** (see Q8) |
| 3 | Visits | `visits`: id, title, instructions, startAt, endAt, visitStatus, parent job id |
| 4 | Invoices | `invoices`: id, `invoiceStatus`, linked jobs — used to derive the Jobs list "Billing Status" |
| 5 | Notes | notes attached to clients, jobs, and visits (`CLIENT_NOTES_QUERY` and siblings) |

A **separate** sync, `syncProductsAndServices()`, pulls Jobber's
`productOrServices` (id, name, description, category, `defaultUnitCost`,
`internalUnitCost`) and routes `PRODUCT` → `Item` and services → the
non-stock path. This is a distinct manual action (`syncJobberInventory` in
`src/lib/actions/jobber.ts`), **not** part of the five-phase Job Flow sync.

All calls go to `https://api.getjobber.com/api/graphql`, pinned to API version
`2025-04-16`, paginated 25 nodes per page, with cost-based throttle handling
and a 60s per-request timeout (`src/lib/jobber/client.ts`).

**On what schedule** — `src/lib/jobber/auto-sync-scheduler.ts`

- There is **no cron and no external scheduler**. An in-process
  `setInterval` ticks every 30 seconds inside the Next.js server, started once
  per process from `src/instrumentation.ts`.
- The schedule itself is **user-configured in the database**, not in code:
  `Settings.autoSyncEnabled`, `autoSyncTimes` (a list of `HH:MM` strings), and
  `autoSyncDays` (weekday numbers). Times are matched against **Eastern Time**
  wall clock.
- `autoSyncEnabled` defaults to `false`, so out of the box nothing runs
  automatically. **The actual configured times in the live database are
  unknown** — they are data, not code.
- A minute-granular `lastFiredKey` guard prevents double-firing within a
  minute. The interval is `unref()`'d so it does not block clean shutdown on
  redeploy.
- Webhook-driven sync exists but is **switched off**:
  `WEBHOOK_SYNC_ENABLED = false` in `src/app/api/jobber/webhook/route.ts`.
  The route still verifies the HMAC signature and records events, but does not
  drive a sync.

---

## 3. What is the inventory schema? Does each SKU store lead time, reorder point, supplier, and last-counted date?

The inventory record is the `Item` model in `prisma/schema.prisma`. Key fields:

- Identity: `sku` (**optional**, nullable), `name`, `description`,
  `manufacturer`, `model`, `productType`, `jobberProductId` (unique link to
  Jobber)
- Stock: `quantity` (Int), `minQuantity` (Int), `tracksStock` (Boolean —
  false marks a labor/service line that never deducts and never goes short),
  `status`, `active`
- Cost: `unitCost` (Decimal, mapped to a `purchaseCost` column)
- Location: `homeLocation`, `currentLocation` (both free-text `String?`)
- Dates: `purchaseDate`, `createdAt`, `updatedAt`
- Lifecycle (present in schema but noted in-code as not yet surfaced on the
  form): `lifecycleType`, `retirementMaxSeasons`, `retirementMaxRepairs`,
  `retirementConditionFloor`, `seasonsDeployed`, `repairCount`,
  `retirementStatus`
- Other: `photos[]`, `websites[]`, `customFields` (Json)

Direct answers to the four asked-about fields:

| Field | Present? | Detail |
|---|---|---|
| **Lead time** | **No** | No `leadTime`/`leadTimeDays` field anywhere in the schema or `src/`. |
| **Reorder point** | **Partial — not a true reorder point** | There is `minQuantity`, documented as a *low-stock threshold* (items with `quantity <= minQuantity` surface on the dashboard). There is no reorder quantity, no order-up-to level, and nothing that generates a purchase order from it. |
| **Supplier** | **No** | No supplier/vendor entity or foreign key. The closest thing is `Item.websites[]`, a free-text list of vendor links (labeled "Vendor websites" in `src/components/item-form.tsx`), and `manufacturer`, which is not the same as a purchasing supplier. |
| **Last-counted date** | **No** | No `lastCountedAt`, cycle-count, or stocktake field. `purchaseDate` and `updatedAt` exist but neither records a physical count. |

Related inventory models: `Kit` / `KitItem` (a kit is a recipe of items),
`ReplacementQueue`, `MaintenanceTicket`, and the inspection decision tables.

---

## 4. Is there any concept of allocation or reservation, or is on-hand the only quantity tracked?

**There is a real allocation concept, but it is *not* a soft reservation —
there is exactly one quantity column and allocation decrements it.**

- `Item.quantity` is the only quantity field on an item. There is **no**
  `reserved`, `onHand`, `available`, or `allocatedQty` column anywhere in the
  schema (verified by search).
- Allocation is modeled on the **job line**, not the item:
  `JobLineItem.isAllocated` (Boolean) records that allocation has already run
  for that line, which is what makes re-running idempotent
  (`src/lib/actions/auto-allocate.ts` selects only lines where
  `isAllocated: false`).
- When a job is allocated, `deductStock()` in `src/lib/stock.ts` **decrements
  `Item.quantity` immediately**. So stock is consumed at allocation time, not
  reserved and later drawn down. Consequently on-hand as stored already has
  allocated-but-not-yet-installed material removed from it.
- Any shortfall is recorded as a `JobLineShortage` row (`quantityShort`), and
  the job is flagged `isOnHold` — the "Awaiting Stock" state.
- `deductStock` is concurrency-safe: it uses a guarded
  `updateMany(where: quantity >= want)` with a retry loop, so two jobs
  allocating the same scarce item cannot drive quantity negative.
- Returns to stock flow through `adjustStock()` (change orders, job reset,
  deactivation, inspection), which no-ops for `tracksStock: false` services.
- A second, customer-owned pool exists: `CustomerKit` / `CustomerKitItem`
  models a customer's pre-built tote. `JobLineItem.kitsFromTote` records how
  much of a kit line was satisfied from that customer's own tote rather than
  the shared warehouse pool — those units are deliberately not drawn from
  `Item.quantity`.

---

## 5. Does inventory model more than one location (shop vs truck stock)?

**No — there is no per-location quantity.** Stock is a single global pool.

- `Item` has `homeLocation` and `currentLocation`, but both are **free-text
  `String?` labels on the item as a whole**, not quantities. There is no table
  keyed by (item, location) and no way to say "8 in the shop, 2 on the truck."
- `CustomerKit.storageLocation` is likewise a free-text label on a customer's
  tote.
- All stock math (`deductStock`, `adjustStock`) reads and writes the single
  `Item.quantity` column with no location dimension.

So the schema can *label* where an item nominally lives, but it cannot model
shop-vs-truck stock as separate balances.

---

## 6. Where does this run, and what triggers it?

**Where** — a Next.js application (App Router, React server components) with
Prisma against PostgreSQL, deployed on **Railway**. Evidence in code: the
`start` script is `prisma migrate deploy && next start` (`package.json`);
`src/auth.config.ts` and `src/lib/jobber/oauth.ts` both handle running behind
a Railway reverse proxy; `src/lib/jobber/auto-sync-scheduler.ts` documents
Railway's SIGTERM redeploy behavior. There are no `Dockerfile`,
`railway.toml`, `nixpacks.toml`, or `Procfile` files in the repo, so the exact
build/deploy configuration lives in the Railway dashboard and is **unknown
from the code**.

Migrations run automatically on every boot via `prisma migrate deploy` in the
`start` script.

**What triggers a sync** — three paths, two of them live:

1. **Manual** — server actions `syncJobberJobs()` and `syncJobberInventory()`
   in `src/lib/actions/jobber.ts`, invoked from the Jobber page buttons.
   Restricted to Admin/Manager.
2. **Scheduled** — the in-process 30-second ticker described in Q2, gated on
   the database-configured `autoSyncEnabled` / `autoSyncTimes` /
   `autoSyncDays` (Eastern Time). Disabled by default.
3. **Webhook** — `POST /api/jobber/webhook` verifies an HMAC-SHA256 signature
   using `timingSafeEqual` and persists the event, but sync-on-webhook is
   **disabled** (`WEBHOOK_SYNC_ENABLED = false`).

Overlap is prevented by an in-process mutex (`src/lib/jobber/sync-lock.ts`),
which the code notes assumes a **single instance**. Every run is recorded in
the `SyncRun` table with `trigger` (`MANUAL` | `AUTO`), status
(`SUCCESS` | `PARTIAL` | `FAILED`), per-phase counts, phase errors, and
row-level warnings.

Other entry points: NextAuth at `/api/auth/[...nextauth]`, the OAuth
connect/callback routes, a CSV inventory export, and a branding logo route.

---

## 7. Is there a test or sandbox path, or does every run hit live data?

**Every run hits live data. There is no test suite and no sandbox path.**

- **No test framework and no tests.** `package.json` has no test script and no
  test-related dependency (no Jest, Vitest, Mocha, Playwright, Cypress,
  Testing Library). A repo-wide search found zero `*.test.*`, `*.spec.*`, or
  `__tests__` files.
- **No Jobber sandbox.** `JOBBER_API_URL` is a hardcoded constant pointing at
  `https://api.getjobber.com/api/graphql` (`src/lib/jobber/client.ts:9`) with
  no environment-variable override, so there is no way to point the app at a
  test tenant without a code change.
- **No dry-run or mock mode.** A search for sandbox / dry-run / mock switches
  found nothing.
- The only non-production affordances are a local dev server (`next dev`) and
  a database seed script (`prisma/seed.ts`, run via `npm run db:seed`) — a
  local data-seeding path, not a Jobber sandbox.
- Mitigations that exist in place of a sandbox are all runtime safety rails,
  not test isolation: the sync lock, the throttle/retry handling, per-row error
  isolation into `SyncRun` warnings, and a guard that skips the
  deleted-in-Jobber reconciliation when Jobber returns suspiciously few jobs.

**Implication:** any change to sync logic is exercised for the first time
against the live Jobber account and the production database.

---

## 8. Does anything here already read Jobber line items on a job?

**Yes — this is already fully implemented and is central to the app.**

- The Jobs GraphQL query requests nested line items
  (`src/lib/jobber/sync.ts`, in the jobs query): each line's `id`, `name`,
  `description`, `quantity`, and `linkedProductOrService { id }`.
- `syncJobs()` persists them into the `JobLineItem` table, keyed by
  `jobberLineItemId` (unique). Each row stores `quantity`, `rawName`,
  `notes`, and `position`.
- **Lines are resolved to local inventory** via `linkedProductOrService.id`,
  matched against `Item.jobberProductId` and `Kit.jobberProductId`, producing
  either `itemId` (a stock item), `kitId` (a kit recipe), or neither — in
  which case only the raw Jobber text name is kept.
- Line items are reconciled by Jobber line id on each sync (upsert the ones
  Jobber returns, delete only Jobber-sourced lines it no longer returns),
  which deliberately preserves app-owned state on the line — `isAllocated`,
  `kitsFromTote`, and the attached shortage and inspection rows.
- These line items are what the rest of the app is built on: the Pick List,
  allocation (`auto-allocate.ts` walks each line and deducts stock or logs a
  shortage), change orders, inspection decisions, and the materials-demand
  aggregation on the dashboard.

---

## Summary of gaps relevant to purchasing/replenishment

Stated plainly, because several questions circle the same area:

- No lead time, no supplier record, no last-counted date, and no true reorder
  point (only a low-stock threshold that drives a dashboard list).
- No purchase-order concept tied to `minQuantity`.
- One global stock pool — no shop-vs-truck balances.
- Allocation consumes on-hand immediately rather than reserving it, so
  `Item.quantity` cannot be decomposed into free vs committed stock after the
  fact.
- No automated tests and no sandbox, so changes in this area land directly on
  live data.
