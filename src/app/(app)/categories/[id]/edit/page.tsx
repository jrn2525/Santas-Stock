import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { CategoryForm } from "@/components/category-form";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole(["ADMIN", "MANAGER"]);
  const { id } = await params;

  const [category, parents] = await Promise.all([
    prisma.category.findUnique({ where: { id } }),
    prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!category) notFound();

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">Edit category</h1>
        <p className="mt-1 text-sm text-gray-400">{category.name}</p>
      </header>
      <CategoryForm category={category} parents={parents} />
    </>
  );
}
