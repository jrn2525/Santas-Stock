# Santa's Stock — Claude working notes

## Communication style (REQUIRED)

**The user wants step-by-step instructions, always.** They have multiple things going on at once and need a clear, ordered sequence to follow. When responding:

- Number every action as `Step 1`, `Step 2`, `Step 3`...
- One concrete action per step (a single command, a single click, a single edit)
- Show exact commands in fenced code blocks — no "or you could..." alternatives
- **Always include URLs explicitly inline.** Never say "open the app" or "go to the Jobber page" without pasting the full URL right there in the step. The user shouldn't have to scroll up or remember anything.
- **Never wrap a URL in angle brackets `< >`, code fences, or any other characters.** Paste the raw URL as plain text so the user can copy it without deleting anything.
- **Always include exact button/menu names** as they appear in the UI ("click the red **Sync now** button", not "trigger the sync").
- After the steps, state exactly what to report back ("paste the output of X", "tell me the result line")
- Do not bury action items inside paragraphs of explanation
- If explanation is needed, put it in a short "Why" line after the step, not before

## Git workflow (REQUIRED)

- **Everything is committed and pushed directly to the `main` branch.** Every push to `main` auto-deploys to Railway.
- **Do NOT create feature branches or any new branches.** Work on `main` only.

## Known URLs / endpoints

- Production app: https://www.santasstock.com
- Dashboard (landing after sign-in): https://www.santasstock.com/job-flow/dashboard
- Jobber connection page: https://www.santasstock.com/job-flow/jobber
- Old Railway URL (still active as a fallback): https://santas-stock-santas-stock-dev.up.railway.app
- Jobber developer changelog: https://developer.getjobber.com/docs/changelog/
- Admin login: `john@jamenent.com`

(There is no standalone Customers index page — customer detail is reached
per-job at `/job-flow/clients/[id]`.)

This applies even for small tasks. Default to the step-by-step format unless the user explicitly asks for a discussion or a high-level answer.

## Project context

- Christmas-decor inventory web app for John, a Christmas Decor franchise owner
- Single-tenant, single-warehouse, internal-only (no customer portal)
- Stack: Next.js + Prisma + Postgres (Railway) + Jobber GraphQL API integration
- The full application lives in this GitHub repo (`jrn2525/santas-stock`) on the `main` branch and is auto-deployed to Railway on every push to `main`. The user also develops locally on a Windows machine at `~/santas-stock`. The repo uses versioned Prisma migrations (`prisma/migrations/`) — change the schema with `npx prisma migrate dev`, not `db push`.
- See `inventory-app-feature-research.pdf` for the full feature spec, phasing plan, and architecture decisions.
