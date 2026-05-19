"use server";

import { Prisma } from "@prisma/client";
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

// Columns we intentionally ignore from Jobber's Products & Services CSV.
// Kept here as documentation — the importer only reads the five columns it
// recognizes, so any extras (these included) are dropped silently.
const _IGNORED_COLUMNS = [
  "Unit Price",
  "Bookable",
  "Duration Minutes",
  "Quantity Enabled",
  "Minimum Quantity",
  "Maximum Quantity",
  "Taxable",
] as const;

// Recognized headers, normalized to lowercase. Accept a few aliases so users
// don't have to hand-edit a Jobber export.
const HEADER_ALIASES: Record<string, "name" | "description" | "category" | "unitCost" | "active"> = {
  name: "name",
  description: "description",
  category: "category",
  "unit cost": "unitCost",
  cost: "unitCost",
  active: "active",
  "visible to clients": "active",
  visible: "active",
};

type ParsedRow = {
  name: string;
  description: string;
  category: string;
  unitCost: string;
  active: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  let i = 0;

  // Strip a UTF-8 BOM if present.
  if (text.charCodeAt(0) === 0xfeff) {
    i = 1;
  }

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
  // Drop fully-empty rows (a trailing newline produces [""])
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

function categoryToTarget(raw: string): "item" | "kit" | null {
  const v = raw.trim().toLowerCase();
  if (v === "product" || v === "products") return "item";
  if (v === "service" || v === "services") return "kit";
  return null;
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
    return {
      ...emptyImportSummary,
      message: "CSV is empty or has no data rows.",
    };
  }

  // Build column index map from the header row.
  const header = rows[0];
  const colMap = new Map<keyof ParsedRow, number>();
  header.forEach((h, idx) => {
    const key = HEADER_ALIASES[h.trim().toLowerCase()];
    if (key) colMap.set(key, idx);
  });

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

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    const get = (k: keyof ParsedRow) => {
      const idx = colMap.get(k);
      return idx === undefined ? "" : (cells[idx] ?? "").trim();
    };

    const name = get("name");
    const categoryRaw = get("category");
    const target = categoryToTarget(categoryRaw);

    if (!name) {
      summary.skipped++;
      summary.errors.push({ row: r + 1, reason: "Missing Name." });
      continue;
    }
    if (!target) {
      summary.skipped++;
      summary.errors.push({
        row: r + 1,
        reason: `Unknown Category "${categoryRaw}" (expected Product or Service).`,
      });
      continue;
    }

    const description = get("description");
    const unitCost = parseDecimal(get("unitCost"));
    const active = parseBool(get("active"));

    try {
      if (target === "item") {
        const existing = await prisma.item.findFirst({ where: { name } });
        if (existing) {
          await prisma.item.update({
            where: { id: existing.id },
            data: { description, unitCost, active },
          });
          summary.items.updated++;
        } else {
          await prisma.item.create({
            data: { name, description, unitCost, active },
          });
          summary.items.created++;
        }
      } else {
        const existing = await prisma.kit.findFirst({ where: { name } });
        if (existing) {
          await prisma.kit.update({
            where: { id: existing.id },
            data: { description, unitCost, active },
          });
          summary.kits.updated++;
        } else {
          await prisma.kit.create({
            data: { name, description, unitCost, active },
          });
          summary.kits.created++;
        }
      }
    } catch (err) {
      summary.skipped++;
      const reason =
        err instanceof Error ? err.message : "Unknown database error.";
      summary.errors.push({ row: r + 1, reason });
    }
  }

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
