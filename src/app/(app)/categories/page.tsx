import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { deleteCategory } from "@/lib/actions/categories";
import { DeleteButton } from "@/components/delete-button";

export const dynamic = "force-dynamic";

const conditionLabels: Record<string, string> = {
  A: "A",
  B: "B",
  C: "C",
  RETIRED: "Retired",
};

export default async function CategoriesPage() {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";

  const categories = await prisma.category.findMany({
    orderBy: [{ parentId: "asc" }, { name: "asc" }],
    include: {
      parent: { select: { name: true } },
      _count: { select: { items: true, children: true } },
    },
  });

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Categories</h1>
          <p className="mt-1 text-sm text-gray-400">
            Group items and set default retirement profiles.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/categories/new"
            className="rounded-md bg-santa-red px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            + New category
          </Link>
        )}
      </header>

      <div className="mt-8 overflow-hidden rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 text-left text-xs uppercase tracking-wider text-gray-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Parent</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3 text-right">Sub-cats</th>
              <th className="px-4 py-3">Max seasons</th>
              <th className="px-4 py-3">Cond. floor</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800 bg-gray-950">
            {categories.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                  No categories yet.
                  {canWrite && (
                    <>
                      {" "}
                      <Link
                        href="/categories/new"
                        className="text-santa-red underline"
                      >
                        Add the first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              categories.map((c) => (
                <tr key={c.id} className="text-gray-200">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {c.parent?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">{c._count.items}</td>
                  <td className="px-4 py-3 text-right">{c._count.children}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {c.defaultRetirementMaxSeasons ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-400">
                    {c.defaultRetirementConditionFloor
                      ? conditionLabels[c.defaultRetirementConditionFloor]
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/categories/${c.id}/edit`}
                          className="text-xs font-medium text-santa-red hover:text-red-300"
                        >
                          Edit
                        </Link>
                        <DeleteButton
                          itemLabel={c.name}
                          action={async () => {
                            "use server";
                            await deleteCategory(c.id);
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
