"use server";

import { ItemStatus, Prisma, ProductType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRoleForAction, ADMIN_ROLES } from "@/lib/auth-helpers";

export type ImportSummary = {
  ok: boolean;
  message: string | null;
  items: { created: number; updated: number };
  kits: { created: number; updated: number };
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

export const emptyImportSummary: ImportSummary = {
  ok: false,
  message: null,
  items: { created: 0, updated: 0 },
  kits: { created: 0, updated: 0 },
  skipped: 0,
  errors: [],
};

// Map every header we recognize to a stable key. Lowercased on lookup so
// header casing doesn't matter.
const HEADER_KEYS = [
  "name",
  "description",
  "category",
  "unitCost",
  "sku",
  "manufacturer",
  "model",
  "productType",
  "status",
  "quantity",
  "active",
  "homeLocation",
  "currentLocation",
] as const;
type HeaderKey = (typeof HEADER_KEYS)[number];

const HEADER_ALIASES: Record<string, HeaderKey> = {
  name: "name",
  description: "description",
  category: "category",
  "unit cost": "unitCost",
  cost: "unitCost",
  sku: "sku",
  manufacturer: "manufacturer",
  model: "model",
  "product type": "productType",
  status: "status",
  quantity: "quantity",
  qty: "quantity",
  active: "active",
  "visible to clients": "active",
  visible: "active",
  "home location": "homeLocation",
  "current location": "currentLocation",
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;

  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cur += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cur);
      cur = "";
      i++;
      continue;
    }
    if (c === "\n" || c === "\r") {
      row.push(cur);
      cur = "";
      rows.push(row);
      row = [];
      if (c === "\r" && text[i + 1] === "\n") i += 2;
      else i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

function parseBool(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (v === "" || v === "true" || v === "yes" || v === "y" || v === "1") return true;
  if (v === "false" || v === "no" || v === "n" || v === "0") return false;
  return true;
}

function parseDecimal(raw: string): Prisma.Decimal | null {
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return null;
  return new Prisma.Decimal(cleaned);
}

function parseInt0(raw: string): number {
  const cleaned = raw.replace(/[,\s]/g, "").trim();
  if (cleaned === "") return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.trunc(n);
}

function categoryToTarget(raw: string): "item" | "kit" | null {
  const v = raw.trim().toLowerCase();
  if (v === "product" || v === "products") return "item";
  if (v === "service" || v === "services") return "kit";
  return null;
}

function parseStatus(raw: string): ItemStatus {
  const v = raw.trim().toLowerCase();
  if (v === "allocated") return ItemStatus.ALLOCATED;
  return ItemStatus.AVAILABLE;
}

function parseProductType(raw: string): ProductType | null {
  const v = raw.trim().toLowerCase();
  if (v === "christmas") return ProductType.CHRISTMAS;
  if (v === "landscape") return ProductType.LANDSCAPE;
  if (v === "permanent") return ProductType.PERMANENT;
  return null;
}

function nullableStr(raw: string): string | null {
  const t = raw.trim();
  return t === "" ? null : t;
}

type ColMap = Map<HeaderKey, number>;

function buildColMap(header: string[]): ColMap {
  const m = new Map<HeaderKey, number>();
  header.forEach((h, idx) => {
    const key = HEADER_ALIASES[h.trim().toLowerCase()];
    if (key) m.set(key, idx);
  });
  return m;
}

// Locate the "Item N" / "Item N Qty" pairs in the header. Returns an array
// of {nameIdx, qtyIdx} in CSV order.
function buildItemSlotMap(
  header: string[],
): Array<{ nameIdx: number; qtyIdx: number }> {
  const byKey = new Map<number, { nameIdx?: number; qtyIdx?: number }>();
  header.forEach((h, idx) => {
    const t = h.trim();
    const qtyMatch = t.match(/^item\s+(\d+)\s+qty$/i);
    const nameMatch = t.match(/^item\s+(\d+)$/i);
    if (qtyMatch) {
      const n = Number(qtyMatch[1]);
      byKey.set(n, { ...(byKey.get(n) ?? {}), qtyIdx: idx });
    } else if (nameMatch) {
      const n = Number(nameMatch[1]);
      byKey.set(n, { ...(byKey.get(n) ?? {}), nameIdx: idx });
    }
  });
  const out: Array<{ nameIdx: number; qtyIdx: number }> = [];
  Array.from(byKey.keys())
    .sort((a, b) => a - b)
    .forEach((n) => {
      const slot = byKey.get(n)!;
      if (slot.nameIdx !== undefined) {
        out.push({ nameIdx: slot.nameIdx, qtyIdx: slot.qtyIdx ?? -1 });
      }
    });
  return out;
}

// Locate "Website N" columns in the header. Returns indices in CSV order.
// A bare "Website" (or "Websites") column is treated as Website 0.
function buildWebsiteSlotIndices(header: string[]): number[] {
  const byKey = new Map<number, number>();
  header.forEach((h, idx) => {
    const t = h.trim();
    const m = t.match(/^website\s*(\d*)$/i) ?? t.match(/^websites$/i);
    if (!m) return;
    const n = m[1] ? Number(m[1]) : 0;
    byKey.set(n, idx);
  });
  return Array.from(byKey.keys())
    .sort((a, b) => a - b)
    .map((n) => byKey.get(n)!);
}

function readCell(cells: string[], idx: number | undefined): string {
  if (idx === undefined || idx < 0) return "";
  return (cells[idx] ?? "").trim();
}

export async function importInventoryCsv(
  _prev: ImportSummary,
  formData: FormData,
): Promise<ImportSummary> {
  await assertRoleForAction(ADMIN_ROLES);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ...emptyImportSummary, message: "Choose a CSV file first." };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { ...emptyImportSummary, message: "CSV is empty or has no data rows." };
  }

  const header = rows[0];
  const colMap = buildColMap(header);
  const itemSlots = buildItemSlotMap(header);
  const websiteSlots = buildWebsiteSlotIndices(header);

  const missing: string[] = [];
  if (!colMap.has("name")) missing.push("Name");
  if (!colMap.has("category")) missing.push("Category");
  if (missing.length > 0) {
    return {
      ...emptyImportSummary,
      message: `Missing required column(s): ${missing.join(", ")}.`,
    };
  }

  const summary: ImportSummary = {
    ok: true,
    message: null,
    items: { created: 0, updated: 0 },
    kits: { created: 0, updated: 0 },
    skipped: 0,
    errors: [],
  };

  // Pre-classify rows into Item / Kit buckets so we can run Items first and
  // resolve Kit→Item references by name.
  type Row = { rowNum: number; cells: string[]; target: "item" | "kit" };
  const itemRows: Row[] = [];
  const kitRows: Row[] = [];

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const rowNum = r + 1;
    const name = readCell(cells, colMap.get("name"));
    const categoryRaw = readCell(cells, colMap.get("category"));
    const target = categoryToTarget(categoryRaw);

    if (!name) {
      summary.skipped++;
      summary.errors.push({ row: rowNum, reason: "Missing Name." });
      continue;
    }
    if (!target) {
      summary.skipped++;
      summary.errors.push({
        row: rowNum,
        reason: `Unknown Category "${categoryRaw}" (expected Product or Service).`,
      });
      continue;
    }
    (target === "item" ? itemRows : kitRows).push({ rowNum, cells, target });
  }

  // Pre-load existing rows by name so the inner loops don't each do their
  // own findFirst. One query each instead of one-per-row.
  const [existingItems, existingKits] = await Promise.all([
    prisma.item.findMany({ select: { id: true, name: true } }),
    prisma.kit.findMany({ select: { id: true, name: true } }),
  ]);
  const itemIdByName = new Map<string, string>(
    existingItems.map((e) => [e.name, e.id]),
  );
  const kitIdByName = new Map<string, string>(
    existingKits.map((e) => [e.name, e.id]),
  );

  // Cap concurrency so we don't blow past Prisma's connection pool. 5 is
  // comfortably below the default pool size and still ~10× faster than
  // sequential.
  const CONCURRENCY = 5;
  async function runInBatches<T>(arr: T[], fn: (x: T) => Promise<void>) {
    for (let i = 0; i < arr.length; i += CONCURRENCY) {
      await Promise.all(arr.slice(i, i + CONCURRENCY).map(fn));
    }
  }

  // ---------- Pass 1: Items ----------
  await runInBatches(itemRows, async ({ rowNum, cells }) => {
    const name = readCell(cells, colMap.get("name"));
    const websites: string[] = [];
    const seenWebsites = new Set<string>();
    for (const idx of websiteSlots) {
      const url = readCell(cells, idx);
      if (url && !seenWebsites.has(url)) {
        seenWebsites.add(url);
        websites.push(url);
      }
    }
    const data = {
      name,
      description: readCell(cells, colMap.get("description")),
      sku: nullableStr(readCell(cells, colMap.get("sku"))),
      manufacturer: nullableStr(readCell(cells, colMap.get("manufacturer"))),
      model: nullableStr(readCell(cells, colMap.get("model"))),
      productType: parseProductType(readCell(cells, colMap.get("productType"))),
      status: parseStatus(readCell(cells, colMap.get("status"))),
      quantity: parseInt0(readCell(cells, colMap.get("quantity"))),
      active: parseBool(readCell(cells, colMap.get("active"))),
      homeLocation: nullableStr(readCell(cells, colMap.get("homeLocation"))),
      currentLocation: nullableStr(readCell(cells, colMap.get("currentLocation"))),
      unitCost: parseDecimal(readCell(cells, colMap.get("unitCost"))),
      websites,
    };
    try {
      const existingId = itemIdByName.get(name);
      if (existingId) {
        await prisma.item.update({ where: { id: existingId }, data });
        summary.items.updated++;
      } else {
        const created = await prisma.item.create({ data });
        itemIdByName.set(name, created.id);
        summary.items.created++;
      }
    } catch (err) {
      console.error(`[csv-import] row ${rowNum} item "${name}":`, err);
      summary.skipped++;
      summary.errors.push({
        row: rowNum,
        reason: err instanceof Error ? err.message : "Unknown database error.",
      });
    }
  });

  // ---------- Pass 2: Kits ----------
  await runInBatches(kitRows, async ({ rowNum, cells }) => {
    const name = readCell(cells, colMap.get("name"));

    const kitItems: { itemId: string; quantity: number }[] = [];
    for (let s = 0; s < itemSlots.length; s++) {
      const slot = itemSlots[s];
      const itemName = readCell(cells, slot.nameIdx);
      if (!itemName) continue;
      const qty = parseInt0(readCell(cells, slot.qtyIdx));
      const itemId = itemIdByName.get(itemName);
      if (!itemId) {
        summary.errors.push({
          row: rowNum,
          reason: `Kit "${name}" references unknown Item "${itemName}" (slot ${s + 1}) — skipped that slot.`,
        });
        continue;
      }
      kitItems.push({ itemId, quantity: qty > 0 ? qty : 1 });
    }

    // Consolidate duplicates (same Item appearing twice).
    const consolidated = new Map<string, number>();
    for (const ki of kitItems) {
      consolidated.set(
        ki.itemId,
        (consolidated.get(ki.itemId) ?? 0) + ki.quantity,
      );
    }
    const kitItemRows = Array.from(consolidated, ([itemId, quantity]) => ({
      itemId,
      quantity,
    }));

    const data = {
      name,
      description: readCell(cells, colMap.get("description")),
      sku: nullableStr(readCell(cells, colMap.get("sku"))),
      manufacturer: nullableStr(readCell(cells, colMap.get("manufacturer"))),
      model: nullableStr(readCell(cells, colMap.get("model"))),
      productType: parseProductType(readCell(cells, colMap.get("productType"))),
      status: parseStatus(readCell(cells, colMap.get("status"))),
      quantity: parseInt0(readCell(cells, colMap.get("quantity"))),
      active: parseBool(readCell(cells, colMap.get("active"))),
      homeLocation: nullableStr(readCell(cells, colMap.get("homeLocation"))),
      currentLocation: nullableStr(readCell(cells, colMap.get("currentLocation"))),
      unitCost: parseDecimal(readCell(cells, colMap.get("unitCost"))),
    };

    try {
      const existingId = kitIdByName.get(name);
      if (existingId) {
        await prisma.$transaction([
          prisma.kitItem.deleteMany({ where: { kitId: existingId } }),
          prisma.kit.update({
            where: { id: existingId },
            data: {
              ...data,
              items: { create: kitItemRows },
            },
          }),
        ]);
        summary.kits.updated++;
      } else {
        const created = await prisma.kit.create({
          data: { ...data, items: { create: kitItemRows } },
        });
        kitIdByName.set(name, created.id);
        summary.kits.created++;
      }
    } catch (err) {
      console.error(`[csv-import] row ${rowNum} kit "${name}":`, err);
      summary.skipped++;
      summary.errors.push({
        row: rowNum,
        reason: err instanceof Error ? err.message : "Unknown database error.",
      });
    }
  });

  const total =
    summary.items.created +
    summary.items.updated +
    summary.kits.created +
    summary.kits.updated;
  summary.message =
    total === 0
      ? "No rows imported."
      : `Imported ${total} row${total === 1 ? "" : "s"}.`;

  revalidatePath("/inventory/items");
  revalidatePath("/inventory/kits");
  revalidatePath("/inventory/import-export");

  return summary;
}
