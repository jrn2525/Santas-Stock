# Prisma migrations

This project moved from `prisma db push` to versioned migrations on
2026-05-23. `0_init` is the **baseline** — a snapshot of the schema that
already existed on the Railway production database at the time of the
switch. The SQL was generated with:

```bash
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
```

## One-time setup against the live database

The production database **already has every table the baseline would
create**, so do NOT run `prisma migrate deploy` against it without
marking the baseline as applied first. From a shell with the prod
`DATABASE_URL` exported (Railway shell, or local with the var set):

```bash
npx prisma migrate resolve --applied 0_init
```

That writes a row into `_prisma_migrations` saying `0_init` is already
applied, without touching any tables. Run it **once**. After that, every
subsequent deploy runs `prisma migrate deploy` (now in `npm start`) and
only applies migrations created after `0_init`.

## Day-to-day workflow

When you change `prisma/schema.prisma`:

```bash
# Locally, against a dev database:
npx prisma migrate dev --name <short_description>
```

Prisma creates a new timestamped folder under `prisma/migrations/`, runs
it against the dev DB, and updates the Prisma Client. Commit the
migration folder. The next Railway deploy will run `prisma migrate
deploy` and pick it up.

## What changed in `package.json`

The `start` script used to be:

```
prisma db push --accept-data-loss --skip-generate && next start
```

That silently destroys data on any drift. Now it's:

```
prisma migrate deploy && next start
```

A deploy with a schema mismatch will now fail loudly instead of dropping
columns.
