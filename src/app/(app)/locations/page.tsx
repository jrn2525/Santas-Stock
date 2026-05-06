import Link from "next/link";
import { LocationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { deleteLocation } from "@/lib/actions/locations";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

const typeLabels: Record<LocationType, string> = {
  WAREHOUSE: "Warehouse",
  AISLE: "Aisle",
  RACK: "Rack",
  BIN: "Bin",
  VEHICLE: "Vehicle",
};

export default async function LocationsPage() {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";

  const locations = await prisma.location.findMany({
    orderBy: [{ type: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { itemsHere: true, children: true } },
    },
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Locations</h1>
          <p className="mt-1 text-sm text-gray-400">
            Where things live: warehouses, aisles, racks, bins, vehicles.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/locations/new"
            className="rounded-md bg-santa-red px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            + New location
          </Link>
        )}
      </header>

      <div className="mt-8 overflow-hidden rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-left text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Parent</th>
              <th className="px-4 py-3">Barcode</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3 text-right">Children</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {locations.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No locations yet.
                  {canWrite && (
                    <>
                      {" "}
                      <Link
                        href="/locations/new"
                        className="text-santa-red underline"
                      >
                        Add the first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              locations.map((l) => (
                <tr key={l.id} className="text-gray-200">
                  <td className="px-4 py-3 font-medium">{l.name}</td>
                  <td className="px-4 py-3 text-gray-400">{typeLabels[l.type]}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {l.parent?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-400">
                    {l.barcode ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{l._count.itemsHere}</td>
                  <td className="px-4 py-3 text-right">{l._count.children}</td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/locations/${l.id}/edit`}
                          className="text-xs font-medium text-santa-red hover:text-red-300"
                        >
                          Edit
                        </Link>
                        <DeleteButton
                          itemLabel={l.name}
                          action={async () => {
                            "use server";
                            await deleteLocation(l.id);
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
