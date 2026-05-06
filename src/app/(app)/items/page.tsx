import Link from "next/link";
import { ConditionGrade, ItemStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { deleteItem } from "@/lib/actions/items";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

const statusLabels: Record<ItemStatus, string> = {
  IN_STORAGE: "In storage",
  RESERVED: "Reserved",
  CHECKED_OUT: "Checked out",
  IN_REPAIR: "In repair",
  RETIRED: "Retired",
  MISSING: "Missing",
};

const statusBadgeStyles: Record<ItemStatus, string> = {
  IN_STORAGE: "bg-gray-700 text-gray-200",
  RESERVED: "bg-yellow-900 text-yellow-200",
  CHECKED_OUT: "bg-blue-900 text-blue-200",
  IN_REPAIR: "bg-orange-900 text-orange-200",
  RETIRED: "bg-gray-800 text-gray-500",
  MISSING: "bg-red-900 text-red-200",
};

const conditionLabels: Record<ConditionGrade, string> = {
  A: "A",
  B: "B",
  C: "C",
  RETIRED: "—",
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const items = await prisma.item.findMany({
    where: query
      ? {
          OR: [
            { sku: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
            { serial: { contains: query, mode: "insensitive" } },
            { barcode: { contains: query, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ name: "asc" }],
    include: {
      category: { select: { name: true } },
      currentLocation: { select: { name: true } },
    },
    take: 200,
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Items</h1>
          <p className="mt-1 text-sm text-gray-400">
            Master inventory. Showing up to 200 results.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/items/new"
            className="rounded-md bg-santa-red px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            + New item
          </Link>
        )}
      </header>

      <form className="mt-6 max-w-md" action="/items">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by SKU, name, serial, or barcode..."
          className="w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:border-santa-red focus:outline-none focus:ring-1 focus:ring-santa-red"
        />
      </form>

      <div className="mt-4 overflow-hidden rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-left text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Cond.</th>
              <th className="px-4 py-3">Current location</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  {query ? (
                    <>No items matched &ldquo;{query}&rdquo;.</>
                  ) : (
                    <>
                      No items yet.
                      {canWrite && (
                        <>
                          {" "}
                          <Link
                            href="/items/new"
                            className="text-santa-red underline"
                          >
                            Add the first one.
                          </Link>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ) : (
              items.map((i) => (
                <tr key={i.id} className="text-gray-200">
                  <td className="px-4 py-3 font-mono text-xs">{i.sku}</td>
                  <td className="px-4 py-3 font-medium">{i.name}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {i.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadgeStyles[i.status]}`}
                    >
                      {statusLabels[i.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {conditionLabels[i.conditionGrade]}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {i.currentLocation?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/items/${i.id}/edit`}
                          className="text-xs font-medium text-santa-red hover:text-red-300"
                        >
                          Edit
                        </Link>
                        <DeleteButton
                          itemLabel={i.name}
                          action={async () => {
                            "use server";
                            await deleteItem(i.id);
                          }}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
