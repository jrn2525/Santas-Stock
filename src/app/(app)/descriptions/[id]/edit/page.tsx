import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { DescriptionForm } from "@/components/description-form";

export const dynamic = "force-dynamic";

export default async function EditDescriptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [description, parents] = await Promise.all([
    prisma.description.findUnique({ where: { id } }),
    prisma.description.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!description) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">Edit description</h1>
        <p className="mt-1 text-sm text-gray-400">{description.name}</p>
      </header>
      <DescriptionForm description={description} parents={parents} />
    </>
  );
}
