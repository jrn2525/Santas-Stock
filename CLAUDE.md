# Santa's Stock — Claude working notes

## No assumptions — check and verify everything (required)

**Do not state anything as fact that has not been verified.** If it can be
checked, check it. If it cannot be checked, say so plainly and ask.

Concretely:

1. **Verify an action succeeded before reporting it done.** "I called the
   tool" is not "it worked" — read it back, re-query, or list it.
2. **Don't declare something impossible from the tool list alone.** This
   environment has a shell, a language runtime, and network access, so a
   missing MCP tool rarely means a missing capability. Reason from what can
   be BUILT, not from the tool names on hand.
3. **Query the real system before describing its state.** DNS, APIs, files,
   repo contents — look, don't infer.
4. **When a decision is the user's, ask.** Offer a recommendation with
   reasoning, then let them choose. Don't pick silently on their behalf.

Corollaries:
- A quick check is cheap; a confident wrong assertion the user acts on is not.
- Say which parts are verified and which are inference.
- Knowledge has a cutoff — third-party UIs, pricing, and policies drift.
  Never present a vendor's current screens or terms as settled fact; ask the
  user what they actually see.
- If a stated "fact" turns out wrong, correct it plainly and fix it wherever
  it was written down, so a later session doesn't inherit the error.

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
- Customers list: https://www.santasstock.com/job-flow/clients (customer detail
  at `/job-flow/clients/[id]`)

This applies even for small tasks. Default to the step-by-step format unless the user explicitly asks for a discussion or a high-level answer.

## Project context

- Christmas-decor inventory web app for John, a Christmas Decor franchise owner
- Single-tenant, single-warehouse, internal-only (no customer portal)
- Stack: Next.js + Prisma + Postgres (Railway) + Jobber GraphQL API integration
- The full application lives in this GitHub repo (`jrn2525/santas-stock`) on the `main` branch and is auto-deployed to Railway on every push to `main`. The user also develops locally on a Windows machine at `~/santas-stock`. The repo uses versioned Prisma migrations (`prisma/migrations/`) — change the schema with `npx prisma migrate dev`, not `db push`.
- See `inventory-app-feature-research.pdf` for the full feature spec, phasing plan, and architecture decisions.
