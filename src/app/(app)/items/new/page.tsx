import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { ItemForm } from "@/components/item-form";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const [categories, locations] = await Promise.all([
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.location.findMany({
      select: { id: true, name: true, type: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">New item</h1>
      </header>
      <ItemForm categories={categories} locations={locations} />
    </>
  );
}
