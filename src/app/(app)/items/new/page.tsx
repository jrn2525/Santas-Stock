import { requireRole } from "@/lib/auth-helpers";
import { ItemForm } from "@/components/item-form";

export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  await requireRole(["ADMIN", "MANAGER"]);

  return (
    <>
      <header>
        <h1 className="text-3xl font-bold text-ink">New item</h1>
      </header>
      <ItemForm />
    </>
  );
}
