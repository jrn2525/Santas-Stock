# Start-With-Me 🪧

**Read me first when picking up a new session.** I'm the running status/handoff doc for Santa's Stock — what we just did, what's pending, and what to verify. I complement `CLAUDE.md` (which has the project overview, the step-by-step communication style, the git workflow, and the known URLs — all auto-loaded each session, so I don't repeat them).

> **Maintenance:** update me at the end of each session — move finished items out, add new "Open items," and refresh "Last session."

_Last updated: 2026-09-03 (auth fix + password features)_

**Current state:** everything is committed and pushed to `main` (auto-deploying to Railway). Working tree clean. **Nothing in flight and no open items.** Last code change was 2026-09-03 (the temp-password nav bug + password features below) — **John confirmed all of it working in production.** `tsc`, build, and `npm run lint` all pass with 0 errors.

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

## Last session (2026-09-03)
Triggered by John onboarding his son **Cooper Nichols** as a Crew user — creating that account surfaced a real bug. All confirmed working in production by John.

### 🐛 Temp-password users hit an error on every nav click — `6bf6aff`
**Repro:** create a user (they get a temporary password, so `mustChangePassword` is set) → sign in → click any sidebar link → *"An unexpected response was received from the server."* **Every new hire would have hit this on their first login.**

**Cause:** `authorized()` in `src/auth.config.ts` returned a bare **`Response.redirect`**. An in-app navigation is an RSC request; a raw redirect hands it HTML instead of an RSC payload and the client router can't parse it. Tell-tale sign it was client-side, not a server throw: **the error box showed no digest.**

**Fixes:**
- Both redirects now use **`NextResponse.redirect`** — Next's own middleware redirect, which the router understands.
- **Navigation is hidden entirely while `mustChangePassword` is set** (sidebar, workspace tabs, settings links). The middleware bounces every route but the password screen, so those links were all dead ends. **Sign out stays** as the escape hatch.
- `requireUser()` now reads `mustChangePassword` from the **DB** alongside role/active, so the layout sees the live value rather than the JWT's cached copy.

⚠️ **Don't "simplify" that back to `Response.redirect`** — it looks equivalent and silently breaks in-app navigation.

### 🔑 Admin can set a specific password — `403ceef`
**Admin → Users → Edit → Password** now has two paths; the original **Reset password** (random temp) is untouched:
- **"Set a password yourself"** — type it and hand it over, with a **"Require them to change it at next login"** checkbox (**default off**, John's explicit choice, so the typed password just works). On success it echoes the password once for copying.
- `setUserPassword` is ADMIN-gated, enforces the same 8-char minimum as the self-service form, and **refuses the shared GUEST demo account** — changing that would lock out every demo user.

### 👁 Password eye toggles — `f42b133`, `606e2a4`
Show/hide on **every** password field: sign-in, all three change-password fields, admin set-password, and the Guest demo password on the new-user form. All share one component, **`src/components/password-input.tsx`** (input + toggle + icons; works controlled or uncontrolled). **No inline `type="password"` inputs remain — use `PasswordInput` for any new one** rather than re-implementing the icons.

---

## Previous session (2026-09-02)

### Hermes daily-report spec — ✅ CLOSED, delivered `cf7361e` → `5a4f8e6`
> **PROJECT CLOSED 2026-09-02.** John handed `docs/hermes-daily-report.md` to the Hermes Agent, which is building against it on the Beelink. **Nothing further for this repo** — it was always a spec for a *separate* system, and no Santa's Stock code changes for it. The remaining §10 items in that file are Hermes's build-time checks, not open items here. Don't reopen unless John asks for a spec change. History below is kept for context only.

Wrote **`docs/hermes-daily-report.md`**: the build spec for a 5:30 AM ET daily email to GM **Scott Granger** (scott@christmasdecorplusmore.com), replacing a flawed earlier draft. Docs-only, no code touched.

**The report:** six sections — today's / this week's / next week's schedule, then payments received, new requests, and quotes approved in the window **5:00 AM → 4:59 AM ET**.

**Two findings that shaped the whole design, both verified in this repo:**
- **Santa's Stock has no payments, requests, or quotes** — only an `invoiceStatus` string. So those three sections **must** query the Jobber API directly; they cannot read Santa's Stock. The old draft claimed "nothing new is pulled from Jobber," which was impossible.
- ⚠️ **Hermes needs its OWN Jobber Developer app.** Jobber **rotates the refresh token on every use**, so sharing Santa's Stock's connection would **silently break the production sync**. John registered **"Managers Daily Report"** with Clients / Scheduled Items / Requests / Quotes / Jobber Payments all Read.

**What Hermes actually is** (read from the `jrn2525/Cudy` repo — briefly made public, now fine to re-privatize): **Nous Research Hermes Agent v0.20.5** on the Beelink (`10.77.42.50`), systemd services `hermes-gateway` + `hermes-dashboard`, config `~/.hermes/config.yaml`, tools consumed via **`mcp_servers` HTTP entries**, and it ships its **own cron**. `cloudflared` runs on that same box.

**Callback URL resolved:** `https://jobber.askjohnbob.com/callback` → new tunnel route → `localhost:8767`. Real HTTPS, terminating on the machine that must hold the rotating refresh token. Recommended shape: a **local Jobber service on `:8767`** owning OAuth + token rotation, exposed to Hermes as an MCP server — mirroring the proven Brain pattern, so Hermes never touches a token. John's own `Brain OAuth/server.py` is a working reference.

**Confirmed by John:** weeks start **Monday**; "Requested" = when the request arrived (render absolute — Jobber shows it relatively as "Fri"/"Aug 26"); Payments must use **Payment date, not Payout date** (they differ by days) and count only **Succeeded**.

**Left unverified on purpose:** the payments/requests/quotes GraphQL query shapes (never used in this repo — introspect before building) and whether re-authorizing one app yields independent token pairs.

---

### Repo findings doc — `a3be709`
Answered eight questions about the codebase (asked in a read-only research framing) and wrote them to **`docs/repo-findings.md`**. Docs-only — no code touched, no behavior change. Worth reading before any purchasing/replenishment work, because it names the gaps precisely.

Headline answers, all cited to files in the doc:
- **Jobber token:** single `JobberConnection` row, both tokens **AES-256-GCM encrypted at rest** (key from `TOKEN_ENCRYPTION_KEY`, falling back to `AUTH_SECRET`). Refresh at <5 min to expiry; Jobber **rotates the refresh token on every use**, so concurrent refreshes are coalesced onto one in-flight promise.
- **Sync scope/schedule:** five phases (Customers+Properties → Jobs incl. line items → Visits → Invoices → Notes); Products/Services is a *separate* manual sync. **No cron** — an in-process 30s ticker reads DB-configured `autoSyncTimes`/`autoSyncDays` (ET). `autoSyncEnabled` defaults **false**; the live configured times are data, so recorded as **unknown**. Webhook sync exists but `WEBHOOK_SYNC_ENABLED = false`.
- **Inventory gaps (relevant to any reordering feature):** **no** lead time, **no** supplier/vendor record, **no** last-counted date, and **no true reorder point** — only `minQuantity`, a low-stock *display* threshold. `Item.sku` is **nullable**.
- **Allocation:** real concept, but **not a reservation** — there is one quantity column and allocation **decrements `Item.quantity` immediately** (`deductStock`), with shortfalls as `JobLineShortage`. So on-hand can't be split into free vs committed after the fact.
- **Locations:** **single global pool.** `homeLocation`/`currentLocation` are free-text labels on the item — no per-location quantities, so shop-vs-truck stock isn't modeled.
- **No tests, no sandbox:** zero test files/deps, and `JOBBER_API_URL` is hardcoded to production with no env override — **every run hits live Jobber and the production DB.**
- **Jobber line items:** already fully ingested into `JobLineItem` and resolved to local `Item`/`Kit` via `linkedProductOrService.id` — the foundation for Pick List, allocation, change orders, and inspection.

Recorded as **unknown** rather than guessed: the live auto-sync times (DB config, not code) and the Railway build config (no `Dockerfile`/`railway.toml` in the repo). Secrets redacted throughout — env vars named only, never valued.

---

## Earlier session (2026-07-02)

### Customer names shown last name first — `ef7c60d`
**Why:** the warehouse totes are labeled "Last, First". Showing one combined name made crew flip it mentally when matching screen to shelf.

- **Customers list** (`/job-flow/clients`): the single Name column became **three** — **Last Name | First Name | Company**. Company shows `companyName` exactly as Jobber has it (John's explicit call — he asked for a dedicated Company column rather than folding it into Last Name). All three cells link to the customer detail page.
- **Sorting changed with it**: the list was ordered by `name` (which is *first* name for people), so a Last Name column would have looked unsorted. Now ordered by the new `Client.sortName`.
- **Everywhere with room for one value** → `"Walters, Aaron"`: job detail, Jobs list, Pick List (+ printouts), Calendar (day/week/month), Dashboard, Deactivations, Completed Jobs, item history, stale-job review. **Businesses keep their company name** — that's their identity and what's on a commercial tote.
- **Search widened** on Jobs + Pick List to match `firstName` / `lastName` / `companyName`, so searching a last name alone works (previously only matched the combined `name`).
- **Schema:** `Client.sortName` (+ index), written by the sync (`customerSortName`) and backfilled by migration `20260702000000_client_sort_name` with the same COALESCE precedence — so existing customers sort correctly with **no re-sync needed**.
- **Single source of truth:** `src/lib/customer-name.ts` — `customerLabel()` (returns `—` when empty), `customerLabelOrEmpty()` (returns `""`, for `label && <…>` truthiness checks and composite tooltips), `customerSortName()`, and `customerNameSelect` (the shared Prisma select). **Use these rather than reading `client.name` directly** — that's how the display stays consistent.
- Verified: tsc + build + lint clean, and the formatting logic was unit-checked against real data shapes (person, company, company-with-contact, single-name, unnamed, null). **John confirmed it live in production on 2026-07-02** — display and sorting both correct.

### Also
- **CLAUDE.md fact corrected:** it claimed "there is no standalone Customers index page." There is one (`/job-flow/clients`) — verified via the sidebar entry, the route file, and the build manifest. Fixed per the new no-assumptions rule's "fix it wherever it was written down."
- John added a standing **"No assumptions — check and verify everything"** rule to `CLAUDE.md` (`b23ac14`). It's auto-loaded every session. Practical upshot: verify before reporting done, query the real system, say which parts are verified vs inferred, and ask when the decision is his.

---

## Earlier session (2026-07-01)
Two pieces of work: the **Service Call jobs** feature, then a **deep-dive health check** of the whole app. Most recent first.

### Deep-dive health check
Ran four parallel review agents over the whole app (auth, inventory math, Jobber sync, data-integrity). Foundations verified solid: stock deduction is oversell-safe, `tracksStock` respected everywhere, migration↔schema parity, timezone/pagination/token-encryption/OAuth-CSRF all correct. Fixed and shipped to `main` + `claude/affectionate-knuth-2xK0h`:

- **Security:** `/api/inventory/export`, `/api/jobber/connect`, `/api/jobber/callback` authorized off the cached JWT role — now use `requireRole(ADMIN_ROLES)` (live DB role + `active`). Added a defense-in-depth guard to `/admin/overview`. `1c8dc41`
- **HIGH — sync wiped allocation state:** `syncJobs` delete-recreated every job's line items each run, resetting `isAllocated`/`kitsFromTote` and cascade-deleting shortages + inspection decisions (stock never restored → double-deduct on re-allocate). Now reconciles lines by Jobber line id (upsert Jobber-sourced fields, preserve allocation state, delete only removed Jobber lines, leave app-created lines). `562aaef`
- **HIGH — change order left stale shortages:** in-place line updates kept old `JobLineShortage` rows → under-restore on reset / over-deduct on Release. Now clears the job's shortages at the top of the txn and lets the netDiff pass recreate the real shortfall. `83fe12a`
- **HIGH — tote lookup inconsistent:** deactivate/inspection/change-order used a raw `customerKit.findFirst` (no property→client fallback) → silent tote corruption for multi-property customers. Routed through `findCustomerKit`. `4dd46ba`
- **MEDIUM — sync hardening:** 60s `AbortSignal.timeout` on Jobber fetches (a hung request no longer stalls all syncs behind the lock); the "returned too few jobs" false-delete guard now applies to accounts of any size (was gated at ≥20). `963d42a`

#### Follow-up pass — remaining MEDIUM + LOW fixed
- MEDIUM — `deactivateJob` now ceils the line qty (was under-returning fractional kit lines); `resetJob` + `deleteStaleJob` now take `withJobLock`. `d12303f`
- LOW — `npm run lint` fixed (flat `eslint.config.mjs` + `eslint .`, passes clean); dead-stock excludes service items; sync-logs bounded to 30 days; dashboard stat relabeled "Next 7 days"; `firstCompletedAt` cross-job race closed with a guarded `updateMany`. `0597a48`
- **Still open (cosmetic, audit-display only — deliberately left):** `ChangeOrder.diff` undercounts when a pick list has two lines of the same item/kit; deactivation-report parses its summary from free-text via regex (misfires only on adversarial reason text). Both would need disproportionate change (the latter a schema migration) for rare/adversarial edge cases.

### Service Call jobs + Completed Jobs
- A job whose Pick List contains the labor-only **"Service Call"** item uses a 3-step **Service Call flow** card on the job page (`ServiceCallFlowCard`) instead of the normal Job Flow chart: **Service Call → Scheduled Service Call → Completed Service Call**. Step 1 always lit; step 2 lights up once the job has a visit with a **scheduled date** (synced from Jobber); step 3 via a **Mark Completed Service Call** button (Admin/Manager), with a **Reopen** to undo. `e38746b`
- Completing sets `JobberJob.serviceCallCompletedAt` → the job **leaves the Jobs list** and appears under a new **Completed Jobs** sidebar page (`/job-flow/completed-jobs`) — a Jobs-style checkbox list with a bulk **Delete selected** (confirm step). `e38746b`
- **Delete tombstones** the Jobber id (new `JobTombstone` table) so the Jobs **sync won't re-import** it while it still lives in Jobber. Service calls are labor-only, so there's no inventory to release. `e38746b`
- **Jobs list Stage column** shows the Service Call step ("Service Call" / "Scheduled Service Call") for service-call jobs instead of the normal stage. `47b4664`
- **Health-check fixes:** still surface **Awaiting Stock** on a service-call job if it's ever on hold (never hide a real shortage); hide the Admin **Reset job** button on service-call jobs (it doesn't apply to labor-only). `0ac5421`
- Service Call jobs are **excluded from the Job Flow board + Pick List** (labor-only — no allocation, nothing to pick) via `serviceCallJobWhere`, but **kept on the Calendar + Dashboard schedule** (a scheduled service call is real scheduled work the crew must see). `e1497a3`
- **Schema:** `JobberJob.serviceCallCompletedAt` + `JobTombstone`; migration `20260624000000_service_call` also flags a `Service Call` item non-stock. Detection is by the exact line name **"Service Call"** (case-insensitive at runtime).
- **Two review sub-agents audited the whole feature** — lifecycle, sync/tombstone integrity, delete FK-safety, migration, and permissions all passed with no HIGH/MEDIUM data bugs.

---

## Earlier session (2026-06-24)
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
> ✅ **Nothing open as of 2026-09-02.** Every item below is closed — kept for the record so a later session sees what was decided and why, rather than re-raising it. Start new work from a clean slate.
>
> Health check is also fully closed out — every MEDIUM + LOW is fixed. Only two cosmetic, audit-display-only items were deliberately left (`ChangeOrder.diff` duplicate-line undercount; deactivation-report regex parse); fix on request if they ever matter.

- [x] ~~Confirm the last-name-first display~~ — **John confirmed it live on 2026-07-02: good to go.** `/job-flow/clients` (Last Name | First Name | Company, sorted by last name) and the "Walters, Aaron" format are working in production.
- [x] ~~Confirm the non-stock service items~~ — **VERIFIED IN PRODUCTION 2026-09-02.** `Lift Service`, `Service Call`, and `Specialty Service` all show **Service** in the QTY column on https://www.santasstock.com/inventory/items, so all three `tracksStock=false` migrations matched their names exactly. No fix needed.
- [x] ~~Service Call jobs on the Calendar + Dashboard~~ — **RESOLVED 2026-09-02: John chose to KEEP them visible.** A scheduled service call is real work someone must show up for; hiding it risks a missed appointment. They stay excluded from the Job Flow board + Pick List (the inventory/allocation views). Don't "tidy" this later — it's a deliberate call.
- [x] ~~Heads-up: deleting a Completed Job is permanent~~ — told John 2026-09-02. Tombstoned so sync won't re-import; recovery needs a manual `JobTombstone` row delete.
- [x] ~~Print-URL tip~~ — told John 2026-09-02. Chrome print dialog → **More settings** → untick **Headers and footers** (sticks after once).

## Known follow-ups / deferred (not urgent)
- **Prisma 7 config migration** — a deploy warning says `package.json#prisma` (the seed config) is deprecated and removed in Prisma 7. We're on Prisma 6; deferred to the eventual Prisma 7 upgrade so it's tested together. Not an error.
- Two benign deploy-log warnings (`npm warn config production`, the Prisma deprecation) — harmless, no action.

## Useful pointers
- **Password fields:** always use **`src/components/password-input.tsx`** (`PasswordInput`) — it owns the input, the show/hide eye, and the icons, and works controlled or uncontrolled. Every password field in the app uses it; don't hand-roll another `type="password"` input.
- **Auth redirects:** in `src/auth.config.ts`, redirects **must** be `NextResponse.redirect`, not the bare `Response.redirect`. The raw version looks equivalent but breaks in-app (RSC) navigation — that was the 2026-09-03 bug.
- **`docs/hermes-daily-report.md`** — ✅ **closed/delivered 2026-09-02.** The build spec for Scott's 5:30 AM report; Hermes is building it on John's Beelink. Reference only — **no Santa's Stock work remains**. The one thing to protect if it ever comes up: its Jobber connection must stay **independent** of Santa's Stock's, because Jobber rotates refresh tokens and a shared connection would break the production sync.
- **`docs/repo-findings.md`** — a cited walkthrough of the Jobber token/refresh design, what the sync pulls and when, the inventory schema and its gaps (no lead time / supplier / last-counted / true reorder point), the allocation model, single-pool locations, and the no-tests/no-sandbox reality. Read it before starting purchasing, replenishment, or multi-location work.
- **Customer name display:** always go through `src/lib/customer-name.ts` (`customerLabel` / `customerLabelOrEmpty` / `customerNameSelect`) — never render `client.name` directly, or that spot will silently show first-name-first again and drift from the tote labels. Queries that load a client for display should use `client: { select: customerNameSelect }`.
- **Service Call feature:** detection helper + `serviceCallJobWhere` (Prisma `where` fragment to exclude them) in `src/lib/service-call.ts`; complete/reopen/delete actions in `src/lib/actions/service-call.ts`; the card `src/components/job-flow/service-call-flow-card.tsx`; Completed Jobs page `src/app/(app)/job-flow/completed-jobs/` + `src/components/job-flow/completed-jobs-list.tsx`. Sync skips tombstoned ids in `src/lib/jobber/sync.ts` (tombstone loaded before the pagination loop).
- **Env gotcha (rebuilds):** the web container can wipe `node_modules` between sessions. If `npm ci` succeeds but the **Prisma engine download gets reset by the egress proxy** (`ECONNRESET`/`aborted` on `binaries.prisma.sh`), run `npm ci --ignore-scripts`, then `curl --retry 6 --retry-all-errors` the `libquery_engine.so.node.gz` and `schema-engine.gz` for `debian-openssl-3.0.x` (commit hash = `@prisma/engines-version`), gunzip them into **both** `node_modules/prisma/` and `node_modules/@prisma/engines/`, then `npx prisma generate`. curl retries harder than Prisma's fetcher, which is what makes it work.
- Jobber sync core: `src/lib/jobber/sync.ts`, orchestrated by `src/lib/jobber/run-sync.ts` (manual + auto both record a `SyncRun`). Shared lock: `src/lib/jobber/sync-lock.ts`.
- Inventory math funnels through `src/lib/stock.ts` (`deductStock` / `adjustStock`, both respect `tracksStock`). Job reset logic: `src/lib/reset-job-core.ts` (plain module) wrapped by `src/lib/actions/reset-job.ts` (ADMIN) and `src/lib/actions/stale-jobs.ts` (WRITE_ROLES).
- Print rules: `src/app/(app)/...` pages use `<PrintButton />` + global `@media print` in `src/app/globals.css`.
