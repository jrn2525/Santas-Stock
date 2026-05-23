import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole, WRITE_ROLES } from "@/lib/auth-helpers";
import {
  ChangeOrderEditor,
  type KitRecipeMap,
  type PickerOption,
} from "@/components/job-flow/change-order-editor";
import { STAGE_LABELS } from "@/lib/job-flow";
import { to2Dp } from "@/lib/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

let keyCounter = 0;
const initKey = () => `init-${++keyCounter}`;

export default async function ChangeOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(WRITE_ROLES);
  const { id } = await params;

  const [job, items, kits] = await Promise.all([
    prisma.jobberJob.findUnique({
      where: { id },
      include: {
        lineItems: {
          orderBy: { position: "asc" },
          include: {
            item: { select: { id: true, name: true } },
            kit: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.item.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.kit.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        items: {
          select: {
            quantity: true,
            item: { select: { id: true, name: true } },
          },
          orderBy: { item: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!job) notFound();

  const initialLines = job.lineItems
    .filter((li) => li.item || li.kit)
    .map((li) => ({
      key: initKey(),
      existingId: li.id,
      kind: li.kit ? ("kit" as const) : ("item" as const),
      refId: (li.kit?.id ?? li.item?.id) as string,
      refName: (li.kit?.name ?? li.item?.name) as string,
      quantity: to2Dp(li.quantity),
    }));

  const itemOptions: PickerOption[] = items.map((i) => ({ id: i.id, name: i.name }));
  const kitOptions: PickerOption[] = kits.map((k) => ({ id: k.id, name: k.name }));
  const kitRecipes: KitRecipeMap = Object.fromEntries(
    kits.map((k) => [
      k.id,
      k.items.map((ki) => ({
        itemId: ki.item.id,
        itemName: ki.item.name,
        quantityPerKit: Number(ki.quantity),
      })),
    ]),
  );

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-white no-print">
            <Link
              href={`/job-flow/jobs/${job.id}`}
              className="hover:text-brand"
            >
              ← {job.title ?? "Job"}
            </Link>
          </p>
          <h1 className="mt-2 text-3xl font-bold text-brand-hover">
            Change Order
          </h1>
          <p className="mt-1 text-sm text-white">
            {job.jobNumber && <>Job #{job.jobNumber} · </>}
            Current stage:{" "}
            <span className="text-ink">{STAGE_LABELS[job.currentStage]}</span>
          </p>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      <div className="mt-6">
        <ChangeOrderEditor
          jobId={job.id}
          initialLines={initialLines}
          items={itemOptions}
          kits={kitOptions}
          kitRecipes={kitRecipes}
        />
      </div>
    </>
  );
}
