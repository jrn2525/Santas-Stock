import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth-helpers";
import { CategoryForm } from "@/components/category-form";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  const parents = await prisma.category.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-white">New category</h1>
      </header>
      <CategoryForm parents={parents} />
    </>
  );
}
