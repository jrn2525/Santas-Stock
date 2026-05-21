# Session notes — 2026-05-21

Wrap-up of the Job Flow polish session that ran across 2026-05-20 → 2026-05-21. Branch: `claude/railway-docs-lookup-mm7zM`.

## What shipped this session

Listed newest-first. Every commit has been pushed to the remote.

| Commit | Summary |
|---|---|
| `40d916e` | Job Flow panel: in-panel Next Step button + drop top Inspection callout |
| `242db47` | Deactivate Job page: gray text → white, drop opacity-50 |
| `ac48f4a` | Add Deactivation page with return-to-inventory / scrap decisions |
| `e1926aa` | Move Change Order button into Pick List panel header |
| `6128bd7` | Job Flow panel: gray for future, red for current, black for past |
| `cd36cf9` | Job Flow panel: drop opacity-50 dim on disabled stages |
| `8924f7b` | Job Flow panel: white out all remaining gray elements |
| `6ba6eaa` | Job Flow panel: white borders/text + selected = Print red |
| `9815511` | Job Flow panel: red tint + explicit Revert button |
| `6cdd39f` | Reorder Job page sections: Pick List before Notes |
| `0151b2e` | Move Change Order save controls to bottom; add Cancel |
| `beee3a8` | Repurpose Job Flow page as pipeline analytics |

### Feature highlights

**Job Flow analytics page** (`/job-flow/job-flows`). Replaced the "Coming soon" stub with a live pipeline overview: a card per stage with current job counts, an "Awaiting Stock" callout listing every on-hold job, and a recent activity feed showing the last 30 stage transitions.

**Change Order page** polish. The header button is gone — Save now lives at the bottom of the page next to a new Cancel button, labelled just "Save" (no longer "Save Change Order"). The Change Order entry point moved off the page header and into the top-right corner of the Pick List panel where it belongs.

**Job Flow panel** got a full visual overhaul:
- Panel background is now `bg-brand/15` (the same muted red as the active sidebar item) so the right column reads as the primary action area.
- Three-state coloring on every stage button: future = `bg-card` (dark gray), current = `bg-brand` (solid red, same as Print button), past = `bg-canvas` (black).
- All borders, arrows, headings, and helper text are white. No `text-ink-dim`, no `border-rule`, no `opacity-50` remain.
- A full-width **Revert button** sits at the bottom of the panel and uses `prevStage()` to compute the previous step (handles terminal → INSPECTION too).
- A contextual **Next step** subsection appears between the chart and Revert button when the job needs follow-up work: "Open Inspection →" or "View Shortages →" (or both). Replaces the old top-of-page Inspection callout, which was easy to miss.

**Deactivation flow** (the big one). New page at `/job-flow/jobs/[id]/deactivate` plus a server action that lets the user decide, per pick list line, how much inventory to return versus scrap. Inventory increments cascade through kit recipes. Sets the job to DEACTIVATED and writes a summary into `JobStageEvent.notes`. Clicking the Deactivated terminal in the Job Flow panel now auto-routes here. Page already in the "white text, no opacity" style.

**Job detail page section order** changed to: Customer + Calendar (top grid) → **Pick List** → Notes → Details. Pick List used to sit under Notes; users wanted the pick list visible first since it's what they scan when opening a job.

## Inspection page — TODO for next session

The user flagged the Inspection page (`/job-flow/jobs/[id]/inspection`) for an overhaul similar to what we just did on the Deactivate page. To be done:

1. **Per-component decisions inside a kit (the big one).** Today, when a pick list line is a kit, marking it Dead/Repaired/Good applies the same decision to the **whole kit** — all components inherit it. The user wants to inspect **each individual component item inside a kit separately** with its own Good/Repaired/Dead choice. A standalone (non-kit) item keeps the single decision it has today.
   - **Data model change required.** Currently one `InspectionLineDecision` per `JobLineItem`. For kit lines, we need per-component granularity. Two options:
     - Add a new `InspectionComponentDecision` table keyed on `(jobLineItemId, itemId)` — cleanest, queryable, but a schema migration.
     - Store per-component decisions inside an existing JSON field on `InspectionLineDecision` (e.g. expand the existing `appliedDeltas` shape into a `componentDecisions` array). No migration, but harder to query later.
   - **Inventory delta logic** needs to recompute per component instead of per line: for each component, apply its own decision (`DEAD` → deduct `componentQty * lineQty` from that component's inventory; `REPAIRED` → pull replacement parts the user specifies; `GOOD` → no change). Today's `computeDeltasForDead` and the REPAIRED branch in `inspection.ts` do this at the line level — they'll need to walk per component.
   - **UI rework.** Inspection row for a kit becomes a nested layout: kit name on top, then one row per component with its own three-button control + (for Repaired) the replacement-parts inputs. Standalone item rows keep the single-row UI they have today.
2. **Rework each row's styling** to match the Deactivate page (white text, no gray, no opacity dimming, white borders). Each row should read cleanly against the dark background.
3. **Replace per-line auto-save with batch Save / Cancel buttons at the bottom of the page.** Today, each decision saves immediately when the user clicks Good/Repaired/Dead via `setInspectionDecision`. The user wants a Save button at the bottom (like the Change Order and Deactivate pages) plus a Cancel button next to it. That means tracking pending decisions client-side until Save is pressed.
4. **White out all gray text at the top of the page** — the back link (`← {job.title}`), page subtitle (`Job #N · X of Y lines inspected`), and the instruction callout that explains Good/Repaired/Dead. Pattern is identical to what we did on the Deactivate page (`text-ink-dim` → `text-white`).
5. **Drop any remaining `opacity-50`** on the inspection form.

Critical files for this work:
- `src/app/(app)/job-flow/jobs/[id]/inspection/page.tsx`
- `src/components/job-flow/inspection-row.tsx`
- `src/lib/actions/inspection.ts` (if batching changes the server action shape)

## Other open items (still on the master plan)

These came up earlier but weren't started today. They live in the master plan at `/root/.claude/plans/can-we-do-some-resilient-cray.md`.

- **Dead Inventory tracking** — neither inspection nor deactivation writes a queryable per-item audit log of dead/scrapped quantities. Proposed plan: new `DeadStockEvent` table written by both flows, plus an `/inventory/dead-stock` page that aggregates by item. Discussed, not built.
- **Customer auto-conversion at Built terminal** — when a job hits the COMPLETE stage, the customer should auto-convert from NEW to EXISTING and any pre-built customer-specific kits should be persisted in a `CustomerKit` row. The other half of the original deactivation slice; deferred when we built the deactivation page.
- **"Built" terminal label is ambiguous** — there are two "Built" buttons on the Job Flow chart (mid-pipeline BUILT stage *and* the terminal COMPLETE stage). The user said yes to renaming the terminal label to "Complete" then redirected; the rename is still outstanding.

## Branch / push state

- Branch: `claude/railway-docs-lookup-mm7zM` (tracks `origin/claude/railway-docs-lookup-mm7zM`)
- Latest commit: `40d916e`
- Working tree clean before this notes file is added.
- No open PR — the work has been pushed to the branch, ready to PR or merge when desired.
