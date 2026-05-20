import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  InspectionRowControls,
  type InspectionLine,
} from "@/components/job-flow/inspection-row";
import { to2Dp } from "@/lib/format";

export const dynamic = "force-dynamic";

const decisionLabels: Record<string, string> = {
  GOOD: "Good",
  REPAIRED: "Repaired",
  DEAD: "Dead",
};

export default async function InspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(WRITE_ROLES);
  const { id } = await params;

  const job = await prisma.jobberJob.findUnique({
    where: { id },
    include: {
      lineItems: {
        orderBy: [{ position: "asc" }],
        include: {
          item: true,
          kit: {
            include: {
              items: {
                include: { item: { select: { id: true, name: true } } },
                orderBy: { item: { name: "asc" } },
              },
            },
          },
          inspectionDecision: true,
        },
      },
    },
  });
  if (!job) notFound();

  const lines: Array<{
    pickList: {
      id: string;
      name: string;
      quantity: number;
      kind: "kit" | "item" | "unresolved";
      components: Array<{ itemId: string; itemName: string; quantityPerKit: number }>;
      itemId?: string;
    };
    decision: InspectionLine;
  }> = job.lineItems.map((li) => {
    const quantity = Number(li.quantity);
    const baseKind: "kit" | "item" | "unresolved" = li.kit
      ? "kit"
      : li.item
        ? "item"
        : "unresolved";
    const components = li.kit
      ? li.kit.items.map((ki) => ({
          itemId: ki.itemId,
          itemName: ki.item.name,
          quantityPerKit: Number(ki.quantity),
        }))
      : [];

    // Parse existing repair quantities (if previously saved)
    const repairQtyByItemId: Record<string, number> = {};
    const applied = li.inspectionDecision?.appliedDeltas;
    if (
      li.inspectionDecision?.decision === "REPAIRED" &&
      Array.isArray(applied)
    ) {
      for (const row of applied) {
        if (
          row &&
          typeof row === "object" &&
          typeof (row as { itemId?: unknown }).itemId === "string" &&
          typeof (row as { quantity?: unknown }).quantity === "number"
        ) {
          repairQtyByItemId[(row as { itemId: string }).itemId] = (
            row as { quantity: number }
          ).quantity;
        }
      }
    }

    return {
      pickList: {
        id: li.id,
        name:
          li.kit?.name ??
          li.item?.name ??
          li.rawName ??
          "(unnamed line)",
        quantity,
        kind: baseKind,
        components,
        itemId: li.item?.id,
      },
      decision: {
        id: li.id,
        name:
          li.kit?.name ??
          li.item?.name ??
          li.rawName ??
          "(unnamed line)",
        quantity,
        kind: baseKind,
        components,
        itemId: li.item?.id,
        decision: li.inspectionDecision?.decision ?? null,
        repairQtyByItemId,
      },
    };
  });

  // Progress summary
  const total = lines.filter((l) => l.pickList.kind !== "unresolved").length;
  const decided = lines.filter((l) => l.decision.decision !== null).length;

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-dim">
            <Link href={`/job-flow/jobs/${job.id}`} className="hover:text-ink">
              ← {job.title ?? "Job"}
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            Inspection
          </h1>
          <p className="mt-1 text-sm text-ink-dim">
            {job.jobNumber && <>Job #{job.jobNumber} · </>}
            {decided} of {total} lines inspected
          </p>
        </div>
      </header>

      <section className="mt-6 rounded-md border border-rule bg-card p-4 text-sm text-ink-dim">
        Walk each line and mark <strong className="text-green-300">Good</strong>{" "}
        (no inventory change),{" "}
        <strong className="text-yellow-300">Repaired</strong> (pull replacement
        parts from inventory and allocate to the kit), or{" "}
        <strong className="text-red-300">Dead</strong> (entire line scrapped —
        inventory deducted permanently). You can change decisions; the system
        reverses the prior deltas before applying the new ones.
      </section>

      <ul className="mt-6 space-y-3">
        {lines.map(({ pickList, decision }) => (
          <li
            key={pickList.id}
            className="rounded-md border border-rule bg-canvas p-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-ink">{pickList.name}</div>
                {decision.decision && (
                  <span className="mt-1 inline-block text-xs italic text-ink-dim">
                    Currently marked: {decisionLabels[decision.decision]}
                  </span>
                )}
              </div>
              <span className="text-sm font-medium text-ink tabular-nums whitespace-nowrap">
                ×{to2Dp(pickList.quantity)}
              </span>
            </div>

            {pickList.kind === "kit" && pickList.components.length > 0 && (
              <ul className="mt-2 ml-6 space-y-0.5 border-l border-rule pl-3 text-xs text-ink-dim">
                {pickList.components.map((c) => (
                  <li
                    key={c.itemId}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="truncate">{c.itemName}</span>
                    <span className="tabular-nums whitespace-nowrap">
                      ×{to2Dp(c.quantityPerKit * pickList.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3">
              <InspectionRowControls line={decision} />
            </div>
          </li>
        ))}
      </ul>

      {lines.length === 0 && (
        <p className="mt-8 text-sm text-ink-dim">
          No pick list lines on this job.
        </p>
      )}
    </>
  );
}
