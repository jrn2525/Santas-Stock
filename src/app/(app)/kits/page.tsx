import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { deleteKit } from "@/lib/actions/kits";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

export default async function KitsPage() {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";

  const kits = await prisma.kit.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      items: {
        select: { quantity: true, item: { select: { name: true } } },
      },
    },
    take: 200,
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Kits</h1>
          <p className="mt-1 text-sm text-gray-400">
            Bundles of items — like recipes, where each kit lists the items and
            quantities it needs.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/kits/new"
            className="rounded-md bg-santa-red px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            + New kit
          </Link>
        )}
      </header>

      <div className="mt-8 overflow-hidden rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-left text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Distinct items</th>
              <th className="px-4 py-3 text-right">Total qty</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {kits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  No kits yet.
                  {canWrite && (
                    <>
                      {" "}
                      <Link href="/kits/new" className="text-santa-red underline">
                        Add the first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              kits.map((k) => {
                const totalQty = k.items.reduce((sum, ki) => sum + ki.quantity, 0);
                return (
                  <tr key={k.id} className="text-gray-200">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 text-gray-400">
                      {k.items.length === 0 ? (
                        <span className="text-gray-500">—</span>
                      ) : (
                        k.items
                          .map((ki) => `${ki.item.name} ×${ki.quantity}`)
                          .join(", ")
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{k.items.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{totalQty}</td>
                    <td className="px-4 py-3 text-right">
                      {canWrite && (
                        <div className="flex justify-end gap-3">
                          <Link
                            href={`/kits/${k.id}/edit`}
                            className="text-xs font-medium text-santa-red hover:text-red-300"
                          >
                            Edit
                          </Link>
                          <DeleteButton
                            itemLabel={k.name}
                            action={async () => {
                              "use server";
                              await deleteKit(k.id);
                            }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
