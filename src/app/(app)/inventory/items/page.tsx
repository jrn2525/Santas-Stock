import Link from "next/link";
import { ItemStatus, type Prisma, ProductType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import { deleteItem } from "@/lib/actions/items";
import { DeleteButton } from "@/components/delete-button";
import { to2Dp } from "@/lib/format";
import { Pagination, parsePageParam } from "@/components/pagination";

export const dynamic = "force-dynamic";

const statusLabels: Record<ItemStatus, string> = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
};

const statusBadgeStyles: Record<ItemStatus, string> = {
  AVAILABLE: "bg-card text-ink",
  ALLOCATED: "bg-brand text-ink",
};

const productTypeLabels: Record<ProductType, string> = {
  CHRISTMAS: "Christmas",
  LANDSCAPE: "Landscape",
  PERMANENT: "Permanent",
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const user = await requireUser();
  const { defaultPageSize: PAGE_SIZE } = await getSettings();
  const canWrite = user.role === "ADMIN" || user.role === "MANAGER";
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  const page = parsePageParam(pageParam);

  const where: Prisma.ItemWhereInput | undefined = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { sku: { contains: query, mode: "insensitive" } },
          { homeLocation: { contains: query, mode: "insensitive" } },
          { currentLocation: { contains: query, mode: "insensitive" } },
        ],
      }
    : undefined;

  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: [{ name: "asc" }],
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.item.count({ where }),
  ]);

  return (
    <>
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-hover">Items</h1>
          <p className="mt-1 text-sm text-ink-dim">
            Master inventory.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/inventory/items/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-medium text-ink hover:bg-brand-hover"
          >
            + New item
          </Link>
        )}
      </header>

      <form className="mt-6 max-w-md" action="/inventory/items">
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search by name, description, SKU, or location..."
          className="w-full rounded-md border border-rule bg-card px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-card text-left text-xs uppercase tracking-wider text-ink-dim">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Product type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3">Home location</th>
              <th className="px-4 py-3 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule bg-canvas">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-dim">
                  {query ? (
                    <>No items matched &ldquo;{query}&rdquo;.</>
                  ) : (
                    <>
                      No items yet.
                      {canWrite && (
                        <>
                          {" "}
                          <Link
                            href="/inventory/items/new"
                            className="text-brand underline"
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
                <tr key={i.id} className="text-ink">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/inventory/items/${i.id}`}
                      className="hover:text-brand"
                    >
                      {i.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{i.description}</td>
                  <td className="px-4 py-3 text-ink-dim">
                    {i.productType ? productTypeLabels[i.productType] : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${statusBadgeStyles[i.status]}`}
                    >
                      {statusLabels[i.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.tracksStock ? (
                      to2Dp(i.quantity)
                    ) : (
                      <span className="text-ink-muted" title="Pay-by-the-hour service — no stock tracked">
                        Service
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-dim">{i.homeLocation ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {canWrite && (
                      <div className="flex justify-end gap-3">
                        <Link
                          href={`/inventory/items/${i.id}/edit`}
                          className="text-xs font-medium text-brand hover:text-brand-hover"
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

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        baseUrl="/inventory/items"
        preserved={query ? { q: query } : {}}
      />
    </>
  );
}
