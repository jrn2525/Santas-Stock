import { ItemStatus, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRole, ADMIN_ROLES } from "@/lib/auth-helpers";
import { CleanupSection, type CleanupRow } from "@/components/admin/cleanup-section";
import {
  bulkDeleteItems,
  bulkDeleteKits,
  deleteAllItems,
  deleteAllKits,
} from "@/lib/actions/admin-cleanup";

export const dynamic = "force-dynamic";

const itemStatusLabels: Record<ItemStatus, string> = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
};

const productTypeLabels: Record<ProductType, string> = {
  CHRISTMAS: "Christmas",
  LANDSCAPE: "Landscape",
  PERMANENT: "Permanent",
};

export default async function CleanupPage({
  searchParams,
}: {
  searchParams: Promise<{ iq?: string; kq?: string }>;
}) {
  await requireRole(ADMIN_ROLES);

  const { iq, kq } = await searchParams;
  const itemQuery = iq?.trim() ?? "";
  const kitQuery = kq?.trim() ?? "";

  const [items, itemTotal, kits, kitTotal] = await Promise.all([
    prisma.item.findMany({
      where: itemQuery
        ? {
            OR: [
              { name: { contains: itemQuery, mode: "insensitive" } },
              { sku: { contains: itemQuery, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        name: true,
        sku: true,
        productType: true,
        status: true,
        quantity: true,
      },
    }),
    prisma.item.count(),
    prisma.kit.findMany({
      where: kitQuery
        ? {
            OR: [
              { name: { contains: kitQuery, mode: "insensitive" } },
              { sku: { contains: kitQuery, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        name: true,
        sku: true,
        productType: true,
        quantity: true,
      },
    }),
    prisma.kit.count(),
  ]);

  const itemRows: CleanupRow[] = items.map((i) => ({
    id: i.id,
    primary: i.name,
    secondary: i.sku ?? `Qty: ${i.quantity}`,
    tertiary: `${i.productType ? productTypeLabels[i.productType] : "—"} · ${itemStatusLabels[i.status]}`,
  }));

  const kitRows: CleanupRow[] = kits.map((k) => ({
    id: k.id,
    primary: k.name,
    secondary: k.sku ?? `Qty: ${k.quantity}`,
    tertiary: k.productType ? productTypeLabels[k.productType] : "—",
  }));

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Data cleanup</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Surgically delete Items and Kits from the database. Use this when a
          CSV import created bad rows, or when you need to start a section
          fresh. Job line items referencing deleted rows are preserved with
          their references nulled out.
        </p>
      </header>

      <div className="mt-6 rounded-md border border-red-700/40 bg-red-900/20 p-4 text-sm text-red-100">
        <strong className="font-semibold">Heads up.</strong> Deletions here are
        permanent. The confirmation requires you to type{" "}
        <code className="rounded bg-black/30 px-1 font-mono text-xs">
          DELETE
        </code>{" "}
        before the button activates.
      </div>

      <div className="mt-8 space-y-8">
        <CleanupSection
          title="Items"
          rows={itemRows}
          totalCount={itemTotal}
          searchParamName="iq"
          initialQuery={itemQuery}
          columnHeaders={["Name", "SKU / Qty", "Type · Status"]}
          bulkDeleteAction={bulkDeleteItems}
          deleteAllAction={deleteAllItems}
        />
        <CleanupSection
          title="Kits"
          rows={kitRows}
          totalCount={kitTotal}
          searchParamName="kq"
          initialQuery={kitQuery}
          columnHeaders={["Name", "SKU / Qty", "Type"]}
          bulkDeleteAction={bulkDeleteKits}
          deleteAllAction={deleteAllKits}
        />
      </div>
    </>
  );
}
