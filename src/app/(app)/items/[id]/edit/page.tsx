import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { ItemForm } from "@/components/item-form";

export const dynamic = "force-dynamic";

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [item, categories, locations] = await Promise.all([
    prisma.item.findUnique({ where: { id } }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      select: { id: true, name: true, type: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!item) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">Edit item</h1>
        <p className="mt-1 text-sm text-gray-400">
          {item.name} · <span className="font-mono">{item.sku}</span>
        </p>
      </header>
      <ItemForm item={item} categories={categories} locations={locations} />
    </>
  );
}
