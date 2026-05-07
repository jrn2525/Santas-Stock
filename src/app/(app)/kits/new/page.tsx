import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { KitForm } from "@/components/kit-form";

export const dynamic = "force-dynamic";

export default async function NewKitPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const items = await prisma.item.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-ink">New kit</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Pick the items that go into this kit and how many of each.
        </p>
      </header>
      <KitForm items={items} />
    </>
  );
}
