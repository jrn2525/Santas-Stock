# Santa's Stock

Inventory management web app for Christmas Decor, with planned Jobber integration.

Phase 1 MVP scope (in progress): auth + 3 roles, items/categories/locations CRUD,
CSV import/export, Jobber OAuth + read-only sync, basic admin dashboard.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS**
- **Prisma** ORM
- **PostgreSQL** (hosted on Railway)
- **NextAuth.js** (Auth.js v5) with email/password credentials, JWT sessions, bcrypt-hashed passwords
- Photo storage and background jobs: deferred to later passes

## Getting started (Windows / PowerShell)

### 1. Clone the branch

```powershell
git clone -b claude/railway-docs-lookup-mm7zM https://github.com/jrn2525/santas-stock.git
cd santas-stock
```

If you already cloned the repo, just check out the branch:

```powershell
git fetch origin
git checkout claude/railway-docs-lookup-mm7zM
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

### 4. Push the Prisma schema to the Railway database

```powershell
npm run db:push
```

You should see `Your database is now in sync with your Prisma schema.`

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
| `npm run start`    | Run the production build                         |
| `npm run typecheck`| TypeScript type check, no emit                   |
| `npm run db:push`  | Sync `schema.prisma` to the database (no migrations) |
| `npm run db:migrate` | Create + apply a versioned migration           |
| `npm run db:studio`| Open Prisma Studio — a UI to browse/edit data    |
| `npm run db:seed`  | Create / upsert the admin user from `.env`       |

## Project layout

```
prisma/
  schema.prisma      ← database schema (Phase 1 + future tables)
  seed.ts            ← creates the admin user from .env
src/
  app/
    api/auth/[...nextauth]/route.ts  ← NextAuth handler
    sign-in/page.tsx                 ← public sign-in form
    dashboard/page.tsx               ← protected home for signed-in users
    unauthorized/page.tsx
    layout.tsx, page.tsx, globals.css
  lib/
    prisma.ts        ← shared Prisma client singleton
    auth-helpers.ts  ← requireUser / requireRole
  types/
    next-auth.d.ts   ← Session/JWT type augmentation (id, role)
  auth.config.ts     ← edge-safe NextAuth config (used by middleware)
  auth.ts            ← full NextAuth config (Credentials + bcrypt)
  proxy.ts           ← redirects unauthenticated users to /sign-in
.env.example         ← template for .env
.gitignore
package.json
```

## Where things go from here

Done so far:

- ✅ Pass 1 — scaffold, Prisma schema, Postgres connectivity check
- ✅ Pass 2 — NextAuth (email/password, JWT sessions, bcrypt), 3 roles,
  protected routes, admin seed script, sign-in/sign-out, basic dashboard
- ✅ Pass 3 — Items + Categories + Locations CRUD with role-gated controls,
  searchable item list, sidebar nav, dashboard counts

Next planned passes:

4. CSV import/export
5. Jobber OAuth + read-only client/property/job sync
6. Admin dashboard with deeper KPIs and sync health
7. Optional later: TOTP 2FA for admins (NextAuth WebAuthn or otp library)
