import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { LocationForm } from "@/components/location-form";

export const dynamic = "force-dynamic";

export default async function NewLocationPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const parents = await prisma.location.findMany({
    select: { id: true, name: true, type: true },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">New location</h1>
      </header>
      <LocationForm parents={parents} />
    </>
  );
}
