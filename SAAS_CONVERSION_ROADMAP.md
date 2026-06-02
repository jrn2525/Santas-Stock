# Multi-tenant SaaS conversion roadmap

A reference plan for converting Santa's Stock from a single-tenant app into a multi-tenant subscription product that other Christmas-lighting businesses could subscribe to. **This is not active work** — it's documentation of the path so the decision to pursue it (or not) is informed.

> Generated during the 2026-05-22 planning session. Single most important takeaway: **convert early, not late.** The multi-tenant refactor is dramatically easier while only one tenant's data exists. Doing it after acquiring real customers is painful and risky. If selling is even a possibility, Phase 1 below is the work that should happen before any customer signs up.

---

## The fundamental shift

Today the app is **single-tenant**: one Jobber connection, one set of inventory, one customer list. Every table assumes "this data belongs to the only business using this app." `JobberConnection` is explicitly single-tenant by design (per the schema comment).

To sell access, the app must become **multi-tenant**: each customer business is an isolated tenant ("organization"), and a bug must never let Org A see Org B's data.

---

## Architecture pick: pool model

Three classic multi-tenancy patterns exist (pool, silo, bridge). For a niche-industry B2B SaaS expecting tens to a few hundred customers, **pool** (shared DB, every table gains an `organizationId` column, every query filters on it) is the right call. It's the cheapest to operate, simplest to back up, and well-trodden ground.

The defense-in-depth layer that makes pool safe is **Postgres row-level security (RLS)**: per-table policies tied to a session variable so even a forgotten `where: { organizationId }` can't leak rows. Mandatory for this conversion — without it, one missed Prisma call is a data breach.

---

## Phase 1 — Multi-tenant data + auth (~6–8 weeks part-time)

The unavoidable foundation. Everything else builds on it.

### Schema

- New `Organization` model: `id`, `name`, `slug` (URL-safe), `subscriptionStatus` (enum: `TRIALING` / `ACTIVE` / `PAST_DUE` / `CANCELED`), `trialEndsAt`, timestamps.
- Add `organizationId String` + `organization Organization` relation + `@@index([organizationId])` to every existing tenant-scoped model:
  - **Inventory**: `Item`, `Kit`, `KitItem`, `ReplacementQueue`, `MaintenanceTicket`
  - **Jobber-mirrored**: `JobberJob`, `JobberVisit`, `JobberNote`, `Client`, `Property`, `JobLineItem`, `JobLineShortage`
  - **Job Flow workflow**: `JobStageEvent`, `ChangeOrder`, `InspectionLineDecision`, `InspectionComponentDecision`, `CustomerKit`, `CustomerKitItem`
  - **System**: `SyncEvent`, `CustomFieldDef`, `CustomFieldValue`
- Move `JobberConnection` from single-row singleton (current model comment: "There should only be zero or one row") to one-per-organization. Add `organizationId` + unique constraint on it.
- Re-introduce the `AuditLog` model we dropped — multi-tenant SaaS needs an audit trail per org.
- Move `User` from a flat list to an org membership model. Either `User.organizationId` direct FK (simpler, one org per user) or a `Membership { userId, organizationId, role }` join table (lets one human be in multiple orgs — Christmas decor franchise networks may want this). Recommend direct FK for v1.

### Auth and session

- Extend NextAuth JWT to carry `organizationId` and `orgSlug`. `src/types/next-auth.d.ts` already extends the session shape for `role` and `mustChangePassword` — same pattern.
- Update `auth.ts` `authorize()` callback to load the user's organization and embed its id/slug in the JWT.
- New helper in `src/lib/auth-helpers.ts`: `requireOrgUser()` returns `{ user, organizationId }`. Every page and action calls this instead of `requireUser()`.

### Per-query scoping (the slog)

- Write a Prisma client extension that auto-injects `where: { organizationId }` based on an `AsyncLocalStorage` context populated by `requireOrgUser()`. Forgetting the filter still works because the extension catches it.
- Layer Postgres RLS on top: `ALTER TABLE item ENABLE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation ON item USING (organization_id = current_setting('app.current_org')::text)`. Set the session variable at the start of every request via Prisma's `$transaction` or a middleware.
- Two-layer defense means a missed filter doesn't leak — and you can test by deliberately writing a bad query and confirming it returns zero rows instead of cross-tenant data.

### Per-tenant Jobber OAuth

- Today's callback handler stores tokens in the single `JobberConnection` row. After: it stores them in the org's `JobberConnection`.
- Callback URL needs to know which org the OAuth flow started for. Standard pattern: include `state=<orgId>` in the OAuth request and validate it on callback.
- Per-tenant Jobber API client: `getJobberClient(organizationId)` instead of a global instance.

### Critical files (pattern, not exhaustive)

- `prisma/schema.prisma` — every model adds `organizationId`
- `src/lib/auth-helpers.ts` — add `requireOrgUser()`, deprecate the bare `requireUser()`
- `src/lib/prisma.ts` — wrap with Prisma extension for auto-org-scoping
- `src/auth.ts` + `src/auth.config.ts` — JWT shape
- `src/lib/jobber/*` — per-tenant client factory
- Every page in `src/app/(app)/**/page.tsx` — switch `requireUser` calls to `requireOrgUser`
- Every action in `src/lib/actions/*.ts` — same switch, plus verify entity ownership before mutation

---

## Phase 2 — Self-service signup + onboarding (~2–3 weeks)

Public sign-up that creates a new organization, a free trial, and walks the new customer through their first sync.

- `/signup` page: email + business name + password. Creates Organization + admin User + 14-day trial. Sends confirmation email.
- **Email infrastructure**: **Resend**, picked for the easiest integration on Railway. Free tier (3,000 emails/month) covers the foreseeable future. Add to `package.json`, set `RESEND_API_KEY` env var.
- Email templates: signup confirmation, password reset (the one we deferred — becomes mandatory here), invite teammate, trial expiring, payment failed.
- Password reset flow: new `PasswordResetToken` table, `/forgot-password` request page, `/reset-password?token=...` consume page, time-limited single-use tokens.
- Onboarding wizard at `/onboarding` (or modal on first sign-in):
  1. Invite teammates (optional)
  2. Connect Jobber (with embedded screenshots/video walking through the Jobber dev-center app creation)
  3. First sync
- Jobber dev-app onboarding doc: customer creates an app in Jobber's developer center, sets redirect URI to `https://santas-stock.com/api/jobber/callback`, copies their `client_id` + `client_secret` into the onboarding form. The OAuth flow proceeds from there — fully automated once those two strings are in hand.

---

## Phase 3 — Billing (~2–3 weeks)

Stripe is the standard. Don't reinvent.

- Stripe Customer per Organization, created at signup.
- Stripe Subscription per Organization, attached to a Price (or Prices for tiers).
- **Pricing model recommendation**: **flat per-org**, not per-user. Christmas decor businesses are typically 1–5 people; per-user pricing on a small team discourages adding seasonal crew accounts. Flat $79–$149/month is more digestible.
- Trial → paid: 14-day trial, automatic conversion attempt, dunning emails on failure.
- Subscription gates: middleware that redirects to `/billing` when `subscriptionStatus !== ACTIVE && trialEndsAt < now`.
- **Stripe Customer Portal**: outsource billing UI (update card, see invoices, cancel) to Stripe — link to it from a settings page. Saves weeks of build time.
- Webhook handler at `/api/stripe/webhook` to sync subscription status back to the DB on every Stripe event.

---

## Phase 4 — Operations layer (~3–4 weeks)

What it takes to run the SaaS reliably.

- **Per-tenant Jobber sync queue**: today's sync is a foreground request. With many tenants, switch to BullMQ + Redis. Per-org sync jobs land in the queue, workers process in parallel. Sync UI shows status from the queue.
- **Daily DB backups**: Railway Postgres has snapshot facilities; verify and document the restore procedure.
- **Error monitoring**: Sentry (or Bugsnag), wired into both server actions and the client.
- **Admin panel** at `/superadmin` (only accessible to YOUR account, not customers): list all orgs, see subscription status, force-extend a trial, refund a charge, impersonate a user for support.
- **Customer impersonation**: a button in the admin panel that signs you in *as* a customer's user (with a banner saying so) so you can debug their issue without asking for their password.
- **Audit log**: re-introduce the `AuditLog` table. Write entries from every mutating action — who, what, when, before/after. Critical for "I'm being audited; who changed this row in March?" requests.
- **Per-tenant branding (optional)**: upload custom logo, business name on emails, brand color. Nice but not v1.

---

## Phase 5 — Beta + production polish (~1–2 months)

Don't open this to the world on day one.

- Find 2–3 friendly Christmas decor businesses (not direct competitors!) willing to use it for a season at a steep discount in exchange for feedback. Industry trade shows, Christmas Decor Inc franchisees, niche Reddit/Facebook groups are the usual finds.
- Bug-fix loop based on what surfaces.
- Terms of Service + Privacy Policy. Use a template service (e.g. Termly, Iubenda) for the first cut; don't write from scratch.
- Data deletion process: "delete my org" must actually cascade everything in one transaction (Prisma's cascading deletes handle most of it, but verify per table).
- Status page (e.g. Statuspage) for uptime announcements.
- Support inbox: a real ticketing tool (Help Scout, Front, or just a shared inbox at help@yourdomain) — NOT your personal email.

---

## Distribution: Jobber App Marketplace (planned go-to-market)

> Added 2026-06-02. Owner's stated direction: **next year, publish Santa's Stock as a single public app on the Jobber App Marketplace** so any Jobber user can install it — rather than each customer creating their own Jobber developer app (this supersedes Gotcha #7 below).

The Marketplace is Jobber's official distribution channel and requires **Jobber Developer Center review/approval** before the app can be listed publicly. Plan the conversion to meet Jobber's public-app requirements:

- **One public OAuth app** (a single `client_id` / `client_secret` you own). Users click "Connect" / "Install" and authorize via OAuth — far smoother than the per-customer dev-app onboarding described in Phase 1. This becomes the real install flow once approved; the per-tenant OAuth work in Phase 1 still applies, just keyed to your single public app via the `state=<orgId>` param.
- **Approval prerequisites** (typical): least-privilege OAuth scopes, a public Privacy Policy + Terms of Service, secure token storage (already AES-256-GCM encrypted in this app), a stable production URL, and a demo/walkthrough for Jobber's reviewers. Build to Jobber's current app-review checklist.
- **Re-enable webhooks here.** Real-time sync was turned off for the single-tenant owner build — the Jobber-side webhook subscriptions were deleted **and** `WEBHOOK_SYNC_ENABLED = false` in `src/app/api/jobber/webhook/route.ts`. A Marketplace app should run on webhooks for freshness, so re-enabling is part of this phase: (1) register webhook topics for the public app in the Developer Center, and (2) flip `WEBHOOK_SYNC_ENABLED` to `true`. The per-job lock + a real sync queue (Gotcha #2) matter much more once many tenants receive webhooks concurrently.
- **Sequencing:** this is a later build phase, after the Phase 1 multi-tenant foundation (org scoping + RLS) exists. Do not pursue a Marketplace listing before tenant isolation is solid.

---

## What stays exactly as it is

Once tenant scoping is in, **every existing feature works for every customer without modification**: Job Flow, Inspection (per-component), Deactivation, Change Order (with editable kit components), Customer Kits, Year-2 branching, Reset Job, Replacement Queue, Dead Stock reporting, Print Reports, the whole Job Flow dashboard. The Job Flow panel, the stage chart, the Change Order editor — none of it changes shape. **That's the win: 95% of the product already exists.**

---

## Recommended ordering and timing

- **Phase 1 first, before any other customer signs up.** Doing it later is much harder.
- Phases 2, 3, 4 can run in parallel once Phase 1 is solid.
- Phase 5 happens after the product is technically ready but before public launch.

Realistic total: **6–9 months part-time** from the decision to convert through having a sellable, supportable product.

---

## Gotchas worth knowing about

1. **Cross-tenant data leak is catastrophic.** RLS is non-negotiable. Pen-test the isolation deliberately before launch.
2. **Sync jobs need a queue.** Foreground Jobber syncs don't scale beyond a couple of tenants — switch to BullMQ + Redis early.
3. **Trial conversion is THE metric.** Most signups never convert. The onboarding wizard is the highest-leverage piece of UX you'll build — first 30 minutes determine the next 30 years of revenue from that customer.
4. **You'll have a support deluge in October–December.** Your customers' busy season is also yours. Plan for it: prebuilt support docs, a help inbox, and a willingness to be on-call. Don't sell more seats than you can support during peak.
5. **Jobber is your single point of failure.** API outages, deprecations, or rate-limit tightening at Jobber affect every customer simultaneously. Monitor every Jobber call and have a status-page response ready.
6. **Pricing surprises.** A small 3-person decor business doing $200K/year revenue will balk at $200/month software. The sweet spot is probably $79–$149/month flat. Test with beta customers.
7. **Two distribution models — pick one.** *(a) Fallback:* each customer creates their own app in Jobber's developer center (you cannot legitimately do this for them via API, so the onboarding doc must be crystal clear and the per-step UX dead simple). *(b) Preferred / owner's plan:* publish **one public app on the Jobber App Marketplace** (see "Distribution: Jobber App Marketplace" above) so users install via standard OAuth — removes the per-customer dev-app friction, at the cost of going through Jobber's app review/approval.

---

## Out of scope for this doc

These matter for the business but aren't engineering concerns:

- Marketing site (separate Next.js project — santas-stock.com landing page, pricing page, docs)
- Sales channel and customer acquisition strategy
- Customer success processes
- Specific pricing decisions

---

## How to use this doc

When/if the decision to pursue this lands, start with Phase 1. Read the gotchas list before starting any phase. Treat the effort estimates as part-time-around-running-your-business numbers; full-time would be roughly half that. Don't try to skip Phase 1's RLS layer to save time — that decision haunts every future bug.
