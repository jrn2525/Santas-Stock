import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { LocationForm } from "@/components/location-form";

export const dynamic = "force-dynamic";

export default async function EditLocationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [location, parents] = await Promise.all([
    prisma.location.findUnique({ where: { id } }),
    prisma.location.findMany({
      select: { id: true, name: true, type: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!location) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">Edit location</h1>
        <p className="mt-1 text-sm text-gray-400">{location.name}</p>
      </header>
      <LocationForm location={location} parents={parents} />
    </>
  );
}
