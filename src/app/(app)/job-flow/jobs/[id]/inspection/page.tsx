import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  InspectionForm,
  type InspectionLine,
} from "@/components/job-flow/inspection-form";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

type AppliedDelta = { itemId: string; quantity: number };

function parseRepairFromDeltas(
  appliedDeltas: unknown,
): Record<string, number> {
  if (!Array.isArray(appliedDeltas)) return {};
  const out: Record<string, number> = {};
  for (const row of appliedDeltas) {
    if (!row || typeof row !== "object") continue;
    const r = row as Partial<AppliedDelta>;
    if (typeof r.itemId === "string" && typeof r.quantity === "number") {
      out[r.itemId] = r.quantity;
    }
  }
  return out;
}

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
          componentDecisions: true,
        },
      },
    },
  });
  if (!job) notFound();

  const lines: InspectionLine[] = job.lineItems.map((li) => {
    const quantity = Number(li.quantity);
    const baseKind: "kit" | "item" | "unresolved" = li.kit
      ? "kit"
      : li.item
        ? "item"
        : "unresolved";
    const name =
      li.kit?.name ?? li.item?.name ?? li.rawName ?? "(unnamed line)";

    if (baseKind === "kit" && li.kit) {
      const decisionByComponent = new Map(
        li.componentDecisions.map((cd) => [cd.componentItemId, cd]),
      );
      return {
        id: li.id,
        name,
        quantity,
        kind: "kit",
        components: li.kit.items.map((ki) => {
          const existing = decisionByComponent.get(ki.itemId);
          const repairMap = existing
            ? parseRepairFromDeltas(existing.appliedDeltas)
            : {};
          return {
            itemId: ki.itemId,
            itemName: ki.item.name,
            quantityPerKit: Number(ki.quantity),
            decision: existing?.decision ?? null,
            repairQty:
              existing?.decision === "REPAIRED"
                ? repairMap[ki.itemId] ?? 0
                : 0,
          };
        }),
        itemDecision: null,
        itemRepairQty: 0,
      };
    }

    if (baseKind === "item" && li.item) {
      const repairMap = li.inspectionDecision
        ? parseRepairFromDeltas(li.inspectionDecision.appliedDeltas)
        : {};
      return {
        id: li.id,
        name,
        quantity,
        kind: "item",
        itemId: li.item.id,
        components: [],
        itemDecision: li.inspectionDecision?.decision ?? null,
        itemRepairQty:
          li.inspectionDecision?.decision === "REPAIRED"
            ? repairMap[li.item.id] ?? 0
            : 0,
      };
    }

    return {
      id: li.id,
      name,
      quantity,
      kind: "unresolved",
      components: [],
      itemDecision: null,
      itemRepairQty: 0,
    };
  });

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white">
            <Link
              href={`/job-flow/jobs/${job.id}`}
              className="hover:text-brand"
            >
              ← {job.title ?? "Job"}
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            Inspection
          </h1>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      <InspectionForm jobId={job.id} lines={lines} />
    </>
  );
}
