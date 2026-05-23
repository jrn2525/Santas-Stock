import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { KitForm } from "@/components/kit-form";

export const dynamic = "force-dynamic";

export default async function EditKitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [kit, items] = await Promise.all([
    prisma.kit.findUnique({
      where: { id },
      include: {
        items: { select: { itemId: true, quantity: true } },
      },
    }),
    prisma.item.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!kit) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-brand-hover">Edit kit</h1>
        <p className="mt-1 text-sm text-ink-dim">{kit.name}</p>
      </header>
      <KitForm kit={kit} items={items} />
    </>
  );
}
