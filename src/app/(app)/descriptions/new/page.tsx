import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { DescriptionForm } from "@/components/description-form";

export const dynamic = "force-dynamic";

export default async function NewDescriptionPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const parents = await prisma.description.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">New description</h1>
      </header>
      <DescriptionForm parents={parents} />
    </>
  );
}
