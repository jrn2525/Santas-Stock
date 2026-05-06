# Santa's Stock

Inventory management web app for Christmas Decor, with planned Jobber integration.

Phase 1 MVP scope (in progress): auth + 3 roles, items/categories/locations CRUD,
CSV import/export, Jobber OAuth + read-only sync, basic admin dashboard.

## Stack

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS**
- **Prisma** ORM
- **PostgreSQL** (hosted on Railway)
- Auth, photo storage, background jobs: deferred to later passes

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

### 3. Configure your database URL

Copy the example env file and fill in your real Railway connection string:

```powershell
Copy-Item .env.example .env.local
notepad .env.local
```

Paste the `DATABASE_PUBLIC_URL` you saved from Railway as the `DATABASE_URL`
value (keep the surrounding quotes). Save and close Notepad.

### 4. Push the Prisma schema to the Railway database

This creates all the tables defined in `prisma/schema.prisma`:

```powershell
npm run db:push
```

You should see something like `Your database is now in sync with your Prisma schema.`

### 5. Run the dev server

```powershell
npm run dev
```

Open http://localhost:3000. You should see "Santa's Stock" and a green
"✓ Connected" line with the current Postgres timestamp.

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

## Project layout

```
prisma/
  schema.prisma      ← database schema (Phase 1 + future tables)
src/
  app/
    layout.tsx       ← root layout
    page.tsx         ← home page (renders DB connection check)
    globals.css      ← Tailwind base + theme
  lib/
    prisma.ts        ← shared Prisma client singleton
.env.example         ← template for .env.local
.gitignore
package.json
```

## Where things go from here

Next planned passes:

1. NextAuth.js with email + 2FA, role-based middleware (Admin / Manager / User)
2. Items + Categories + Locations CRUD with the basic admin UI
3. CSV import/export
4. Jobber OAuth + read-only client/property/job sync
5. Admin dashboard with item counts and sync health
