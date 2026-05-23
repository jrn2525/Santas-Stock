import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { deleteKit } from "@/lib/actions/kits";
import { DeleteButton } from "@/components/delete-button";
import { to2Dp } from "@/lib/format";
import { Pagination, parsePageParam } from "@/components/pagination";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function KitsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";
  const { page: pageParam } = await searchParams;
  const page = parsePageParam(pageParam);

  const [kits, total] = await Promise.all([
    prisma.kit.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        items: {
          select: { quantity: true, item: { select: { name: true } } },
        },
      },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.kit.count(),
  ]);

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-hover">Kits</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Bundles of items — like recipes, where each kit lists the items and
            quantities it needs.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/inventory/kits/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
          >
            + New kit
          </Link>
        )}
      </header>

      <div className="mt-8 overflow-hidden rounded-lg border border-rule">
        <table className="w-full text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3 text-right">Distinct items</th>
              <th className="px-4 py-3 text-right">Total qty</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {kits.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-ink-dim">
                  No kits yet.
                  {canWrite && (
                    <>
                      {" "}
                      <Link href="/inventory/kits/new" className="text-brand underline">
                        Add the first one.
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            ) : (
              kits.map((k) => {
                const totalQty = k.items.reduce((sum, ki) => sum + Number(ki.quantity), 0);
                return (
                  <tr key={k.id} className="text-ink">
                    <td className="px-4 py-3 font-medium">{k.name}</td>
                    <td className="px-4 py-3 text-ink-dim">
                      {k.items.length === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        k.items
                          .map((ki) => `${ki.item.name} ×${to2Dp(ki.quantity)}`)
                          .join(", ")
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">{k.items.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{to2Dp(totalQty)}</td>
                    <td className="px-4 py-3 text-right">
                      {canWrite && (
                        <div className="flex justify-end gap-3">
                          <Link
                            href={`/inventory/kits/${k.id}/edit`}
                            className="text-xs font-medium text-brand hover:text-brand-hover"
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

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        baseUrl="/inventory/kits"
        preserved={{}}
      />
    </>
  );
}
