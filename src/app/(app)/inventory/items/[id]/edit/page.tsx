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

  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Edit item</h1>
        <p className="mt-1 text-sm text-ink-dim">{item.name}</p>
      </header>
      <ItemForm item={item} />
    </>
  );
}
