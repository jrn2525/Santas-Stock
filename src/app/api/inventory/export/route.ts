import { NextResponse, type NextRequest } from "next/server";
import { ItemStatus, Prisma, ProductType } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Scope = "items" | "kits" | "both";

function quote(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function row(cells: (string | null | undefined)[]): string {
  return cells.map((c) => quote(c ?? "")).join(",");
}

function decimalToString(d: Prisma.Decimal | null): string {
  return d === null ? "" : d.toFixed(2);
}

const statusLabels: Record<ItemStatus, string> = {
  AVAILABLE: "Available",
  ALLOCATED: "Allocated",
};

const productTypeLabels: Record<ProductType, string> = {
  CHRISTMAS: "Christmas",
  LANDSCAPE: "Landscape",
  PERMANENT: "Permanent",
};

function fixedHeaders(): string[] {
  return [
    "Name",
    "Description",
    "Category",
    "Unit Cost",
    "SKU",
    "Manufacturer",
    "Model",
    "Product Type",
    "Status",
    "Quantity",
    "Active",
    "Home Location",
    "Current Location",
  ];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Not authenticated.", { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return new NextResponse("Forbidden.", { status: 403 });
  }

  const url = new URL(req.url);
  const scopeParam = url.searchParams.get("scope");
  const scope: Scope =
    scopeParam === "items" || scopeParam === "kits" || scopeParam === "both"
      ? scopeParam
      : "both";

  const wantItems = scope === "items" || scope === "both";
  const wantKits = scope === "kits" || scope === "both";

  // Pre-compute the widest Item slot count needed (so the header matches the
  // data). Only Kits use Item slots.
  let maxItemSlots = 0;
  let kits: Awaited<ReturnType<typeof loadKits>> = [];
  if (wantKits) {
    kits = await loadKits();
    for (const k of kits) {
      if (k.items.length > maxItemSlots) maxItemSlots = k.items.length;
    }
  }

  const headers = fixedHeaders();
  for (let s = 1; s <= maxItemSlots; s++) {
    headers.push(`Item ${s}`);
    headers.push(`Item ${s} Qty`);
  }

  const lines: string[] = [];
  lines.push(row(headers));

  if (wantItems) {
    const items = await prisma.item.findMany({
      orderBy: [{ name: "asc" }],
    });
    for (const it of items) {
      const cells = [
        it.name,
        it.description,
        "Product",
        decimalToString(it.unitCost),
        it.sku ?? "",
        it.manufacturer ?? "",
        it.model ?? "",
        it.productType ? productTypeLabels[it.productType] : "",
        statusLabels[it.status],
        String(it.quantity),
        it.active ? "TRUE" : "FALSE",
        it.homeLocation ?? "",
        it.currentLocation ?? "",
      ];
      // Items don't have sub-items, so pad the Item N / Item N Qty columns.
      for (let s = 0; s < maxItemSlots; s++) {
        cells.push("");
        cells.push("");
      }
      lines.push(row(cells));
    }
  }

  if (wantKits) {
    for (const k of kits) {
      const cells = [
        k.name,
        k.description,
        "Service",
        decimalToString(k.unitCost),
        k.sku ?? "",
        k.manufacturer ?? "",
        k.model ?? "",
        k.productType ? productTypeLabels[k.productType] : "",
        statusLabels[k.status],
        String(k.quantity),
        k.active ? "TRUE" : "FALSE",
        k.homeLocation ?? "",
        k.currentLocation ?? "",
      ];
      for (let s = 0; s < maxItemSlots; s++) {
        const slot = k.items[s];
        if (slot) {
          cells.push(slot.item.name);
          cells.push(String(slot.quantity));
        } else {
          cells.push("");
          cells.push("");
        }
      }
      lines.push(row(cells));
    }
  }

  const body = lines.join("\r\n") + "\r\n";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `santas-stock-${scope}-${stamp}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function loadKits() {
  return prisma.kit.findMany({
    orderBy: [{ name: "asc" }],
    include: {
      items: {
        orderBy: { item: { name: "asc" } },
        select: {
          quantity: true,
          item: { select: { name: true } },
        },
      },
    },
  });
}
