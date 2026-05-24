# Santa's Stock — Claude working notes

## Communication style (REQUIRED)

**The user wants step-by-step instructions, always.** They have multiple things going on at once and need a clear, ordered sequence to follow. When responding:

- Number every action as `Step 1`, `Step 2`, `Step 3`...
- One concrete action per step (a single command, a single click, a single edit)
- Show exact commands in fenced code blocks — no "or you could..." alternatives
- **Always include URLs explicitly inline.** Never say "open the app" or "go to the Jobber page" without pasting the full URL right there in the step. The user shouldn't have to scroll up or remember anything.
- **Always include exact button/menu names** as they appear in the UI ("click the red **Sync now** button", not "trigger the sync").
- After the steps, state exactly what to report back ("paste the output of X", "tell me the result line")
- Do not bury action items inside paragraphs of explanation
- If explanation is needed, put it in a short "Why" line after the step, not before

## Known URLs / endpoints

- Production app: https://santas-stock-santas-stock-dev.up.railway.app
- Jobber connection page: https://santas-stock-santas-stock-dev.up.railway.app/jobber
- Customers page: https://santas-stock-santas-stock-dev.up.railway.app/customers
- Jobber developer changelog: https://developer.getjobber.com/docs/changelog/
- Admin login: `john@jamenent.com`

This applies even for small tasks. Default to the step-by-step format unless the user explicitly asks for a discussion or a high-level answer.

## Project context

- Christmas-decor inventory web app for John, a Christmas Decor franchise owner
- Single-tenant, single-warehouse, internal-only (no customer portal)
- Stack: Next.js + Prisma + Postgres (Railway) + Jobber GraphQL API integration
- The actual application code lives on the user's local Windows machine at `~/santas-stock` and is deployed to Railway. This GitHub repo (`jrn2525/santas-stock`) currently only holds branding + research assets.
- See `inventory-app-feature-research.pdf` for the full feature spec, phasing plan, and architecture decisions.
