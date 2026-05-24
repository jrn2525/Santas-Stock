# Santa's Stock

Inventory + job-flow web app for a Christmas-decor business, integrated with
Jobber. Tracks inventory items and kits (bills of materials), mirrors Jobber
clients/jobs/visits/notes, and drives a full operational pipeline from
allocation through inspection, completion, and season-over-season reuse.

What's built today:

- **Auth + roles** — email/password (NextAuth v5), four roles (Admin, Manager,
  Crew, Guest), role-gated pages and actions, temp-password onboarding.
- **Inventory** — Items and Kits CRUD, CSV import/export, low-stock thresholds,
  Dead Stock and Replacement-queue reporting, vendor website links.
- **Jobber sync** — OAuth + GraphQL client; one-click cascade sync of
  Customers → Jobs → Visits → Notes; Products → Items / Services → Kits.
- **Job Flow** — stage pipeline (Allocated → Built → Staged → Installed →
  Inspection → Complete/Deactivated) with auto-allocation, shortage tracking,
  per-component inspection, change orders, deactivation, and admin Reset.
- **Year-2 lifecycle** — pre-built customer kits ("totes") persist at Complete
  and are reused next season instead of re-allocating from raw stock.
- **Dashboards + calendar** — job-flow and inventory dashboards, an
  Eastern-Time Month/Week/Day calendar, and print-friendly reports throughout.

For the detailed state of the codebase, read `SESSION_NOTES_2026-05-23.md`
(the latest durable handoff) and `SAAS_CONVERSION_ROADMAP.md` (deferred
multi-tenant plan).

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS**
- **Prisma** ORM with versioned migrations (`prisma/migrations/`)
- **PostgreSQL** (hosted on Railway)
- **NextAuth.js** (Auth.js v5) with email/password credentials, JWT sessions, bcrypt-hashed passwords
- Photo storage and background jobs: deferred

## Getting started (Windows / PowerShell)

### 1. Clone the repo

```powershell
git clone https://github.com/jrn2525/santas-stock.git
cd santas-stock
```

If you already cloned it, just sync `main`:

```powershell
git checkout main
git pull
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Configure your environment

Copy the example env file and fill in real values:

```powershell
Copy-Item .env.example .env
notepad .env
```

Required values:

- `DATABASE_URL` — your `DATABASE_PUBLIC_URL` from Railway (Variables tab)
- `AUTH_SECRET` — a random ~64-character string. Generate with:
  ```powershell
  -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object {[char]$_})
  ```
  Copy the output and paste it as the `AUTH_SECRET` value.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` — used to create
  your first admin account. Pick a strong password.

Save, close Notepad.

### 4. Apply migrations to the database

This project uses versioned Prisma migrations (not `db push`). Apply every
committed migration to your database:

```powershell
npx prisma migrate deploy
```

You should see the migrations apply (or `No pending migrations to apply.` if
the database is already up to date). See `prisma/migrations/README.md` for the
day-to-day workflow when you change the schema.

### 5. Seed your admin user

```powershell
npm run db:seed
```

You should see `✓ Admin user ready: <your email>`.

### 6. Run the dev server

```powershell
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/sign-in`. Log in with the
admin email and password from `.env`. You should land on the dashboard with
your name and role displayed in the top right.

## Useful commands

| Command            | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `npm run dev`      | Start the dev server on port 3000                |
| `npm run build`    | Production build (also re-generates Prisma client) |
| `npm run start`    | Apply migrations (`prisma migrate deploy`) then run the production build |
| `npm run typecheck`| TypeScript type check, no emit                   |
| `npm run db:migrate` | Create + apply a new migration (`prisma migrate dev`) — use this for schema changes |
| `npm run db:push`  | Push schema without a migration. **Avoid against prod** — bypasses migration history |
| `npm run db:studio`| Open Prisma Studio — a UI to browse/edit data    |
| `npm run db:seed`  | Create / upsert the admin user from `.env`       |

## Project layout

```
prisma/
  schema.prisma      ← database schema
  migrations/        ← versioned migrations (see migrations/README.md)
  seed.ts            ← creates the admin user from .env
src/
  app/
    (app)/           ← authenticated route group (shared layout + sidebar)
      job-flow/      ← dashboard, jobs, pick list, calendar, inspection, etc.
      inventory/     ← items, kits, import/export, dead-stock, replacements
      admin/         ← overview, users, data cleanup (admin-only)
      account/       ← profile + change password
    api/             ← NextAuth handler, Jobber OAuth, CSV export
    sign-in/, unauthorized/, layout.tsx, page.tsx, globals.css
  components/        ← UI components (calendar, forms, job-flow/, admin/)
  lib/
    prisma.ts        ← shared Prisma client singleton
    auth-helpers.ts  ← requireUser / requireRole / assertRoleForAction
    actions/         ← server actions (items, kits, jobber, job-stages, …)
    jobber/          ← OAuth + GraphQL client + sync logic
    datetime.ts, job-flow.ts, format.ts
  types/next-auth.d.ts  ← Session/JWT type augmentation (id, role, …)
  auth.config.ts     ← edge-safe NextAuth config (used by middleware)
  auth.ts            ← full NextAuth config (Credentials + bcrypt)
  middleware.ts      ← redirects unauthenticated users to /sign-in
.env.example         ← template for .env
```

## Where things go from here

The original Phase 1–3 MVP is long shipped. For the current state of the
codebase, the prioritized backlog, and intentionally-deferred items, read
`SESSION_NOTES_2026-05-23.md`. The multi-tenant SaaS path is documented
separately in `SAAS_CONVERSION_ROADMAP.md`.
