import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { jobberQuery } from "./client";

const CLIENTS_QUERY = /* GraphQL */ `
  query SyncClients($cursor: String) {
    clients(first: 25, after: $cursor) {
      nodes {
        id
        firstName
        lastName
        companyName
        tags {
          nodes {
            label
          }
        }
        emails {
          address
        }
        phones {
          number
        }
        properties {
          id
          address {
            street
            city
            province
            postalCode
            country
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type JobberAddress = {
  street: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  country: string | null;
};

type JobberClientNode = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  tags: { nodes: Array<{ label: string | null }> } | null;
  emails: Array<{ address: string }> | null;
  phones: Array<{ number: string }> | null;
  properties: Array<{ id: string; address: JobberAddress | null }> | null;
};

type ClientsResponse = {
  clients: {
    nodes: JobberClientNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

function deriveName(node: JobberClientNode): string {
  if (node.companyName && node.companyName.trim()) return node.companyName.trim();
  const personal = [node.firstName, node.lastName]
    .filter((p) => p && p.trim().length > 0)
    .join(" ")
    .trim();
  if (personal) return personal;
  return "(unnamed)";
}

function compactStrings(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v?.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

export type SyncResult = {
  clientsUpserted: number;
};

export async function syncClientsAndProperties(): Promise<SyncResult> {
  let cursor: string | null = null;
  let clientsUpserted = 0;
  const now = new Date();

  do {
    const data: ClientsResponse = await jobberQuery<ClientsResponse>(
      CLIENTS_QUERY,
      { cursor },
    );
    for (const node of data.clients.nodes) {
      const emails = compactStrings(node.emails?.map((e) => e.address) ?? []);
      const phones = compactStrings(node.phones?.map((p) => p.number) ?? []);
      const tags = compactStrings(node.tags?.nodes?.map((t) => t.label) ?? []);
      const property = node.properties?.[0];
      const addr = property?.address ?? null;

      await prisma.client.upsert({
        where: { jobberClientId: node.id },
        update: {
          name: deriveName(node),
          firstName: node.firstName,
          lastName: node.lastName,
          companyName: node.companyName,
          emails,
          phones,
          tags,
          serviceStreet1: addr?.street ?? null,
          serviceCity: addr?.city ?? null,
          serviceState: addr?.province ?? null,
          serviceCountry: addr?.country ?? null,
          serviceZip: addr?.postalCode ?? null,
          syncedAt: now,
        },
        create: {
          jobberClientId: node.id,
          name: deriveName(node),
          firstName: node.firstName,
          lastName: node.lastName,
          companyName: node.companyName,
          emails,
          phones,
          tags,
          serviceStreet1: addr?.street ?? null,
          serviceCity: addr?.city ?? null,
          serviceState: addr?.province ?? null,
          serviceCountry: addr?.country ?? null,
          serviceZip: addr?.postalCode ?? null,
          syncedAt: now,
        },
      });
      clientsUpserted++;
    }
    cursor = data.clients.pageInfo.hasNextPage ? data.clients.pageInfo.endCursor : null;
  } while (cursor);

  return { clientsUpserted };
}

// ---------------------------------------------------------------------------
// Products & Services sync
// ---------------------------------------------------------------------------
//
// Jobber's catalog is a single "ProductOrService" entity with a category
// (PRODUCT or SERVICE). We pull both and route:
//   PRODUCT  -> Item
//   SERVICE  -> Kit
//
// Matching strategy per row:
//   1. Match by jobberProductId (the Jobber GraphQL ID) if it's set locally.
//   2. Fall back to match by exact name on rows that have no jobberProductId
//      yet (claim-by-name) so CSV-imported rows get linked on first sync.
//   3. Otherwise insert a new row.
//
// Jobber-owned fields (overwritten on every sync): name, description,
// unitCost. Everything else on Item/Kit is Santa's Stock-only and is left
// alone by sync.

const PRODUCT_OR_SERVICE_QUERY = /* GraphQL */ `
  query SyncProductOrServices($cursor: String) {
    productOrServices(first: 25, after: $cursor) {
      nodes {
        id
        name
        description
        category
        defaultUnitCost
        internalUnitCost
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type JobberProductOrServiceNode = {
  id: string;
  name: string | null;
  description: string | null;
  category: string | null;
  defaultUnitCost: number | string | null;
  internalUnitCost: number | string | null;
};

type ProductOrServicesResponse = {
  productOrServices: {
    nodes: JobberProductOrServiceNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type InventorySyncResult = {
  itemsCreated: number;
  itemsUpdated: number;
  kitsCreated: number;
  kitsUpdated: number;
  skipped: number;
  createdItemNames: string[];
  createdKitNames: string[];
  warnings: string[];
};

// Used to match CSV-imported names against what Jobber sends. Excel and
// other CSV editors silently trim, re-case, or collapse whitespace, so an
// exact-string compare here would create duplicates.
function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function pickUnitCost(
  node: JobberProductOrServiceNode,
): Prisma.Decimal | null {
  // Prefer internalUnitCost (our cost basis); fall back to defaultUnitCost
  // so a row at least has a price. Null if neither is set.
  const raw = node.internalUnitCost ?? node.defaultUnitCost;
  if (raw === null || raw === undefined || raw === "") return null;
  const s = String(raw);
  if (Number.isNaN(Number(s))) return null;
  return new Prisma.Decimal(s);
}

export async function syncProductsAndServices(): Promise<InventorySyncResult> {
  const result: InventorySyncResult = {
    itemsCreated: 0,
    itemsUpdated: 0,
    kitsCreated: 0,
    kitsUpdated: 0,
    skipped: 0,
    createdItemNames: [],
    createdKitNames: [],
    warnings: [],
  };

  // Pre-load existing rows for fast claim-by-name fallback. Names should be
  // unique-ish; if not, we'll only claim the first.
  const [existingItems, existingKits] = await Promise.all([
    prisma.item.findMany({
      select: { id: true, name: true, jobberProductId: true },
    }),
    prisma.kit.findMany({
      select: { id: true, name: true, jobberProductId: true },
    }),
  ]);
  const itemIdByJobberId = new Map<string, string>();
  const itemIdByName = new Map<string, string>();
  for (const i of existingItems) {
    if (i.jobberProductId) itemIdByJobberId.set(i.jobberProductId, i.id);
    if (!i.jobberProductId) {
      const key = normalizeName(i.name);
      if (!itemIdByName.has(key)) itemIdByName.set(key, i.id);
    }
  }
  const kitIdByJobberId = new Map<string, string>();
  const kitIdByName = new Map<string, string>();
  for (const k of existingKits) {
    if (k.jobberProductId) kitIdByJobberId.set(k.jobberProductId, k.id);
    if (!k.jobberProductId) {
      const key = normalizeName(k.name);
      if (!kitIdByName.has(key)) kitIdByName.set(key, k.id);
    }
  }

  let cursor: string | null = null;
  do {
    const data: ProductOrServicesResponse =
      await jobberQuery<ProductOrServicesResponse>(PRODUCT_OR_SERVICE_QUERY, {
        cursor,
      });

    for (const node of data.productOrServices.nodes) {
      const name = node.name?.trim();
      if (!name) {
        result.skipped++;
        result.warnings.push(`Jobber row ${node.id} has no name — skipped.`);
        continue;
      }
      const description = (node.description ?? "").trim();
      const unitCost = pickUnitCost(node);
      const category = (node.category ?? "").toUpperCase();

      const isService = category === "SERVICE";
      const isProduct = category === "PRODUCT" || category === "";

      try {
        if (isService) {
          await upsertKit(node.id, name, description, unitCost, {
            kitIdByJobberId,
            kitIdByName,
            result,
          });
        } else if (isProduct) {
          await upsertItem(node.id, name, description, unitCost, {
            itemIdByJobberId,
            itemIdByName,
            result,
          });
        } else {
          result.skipped++;
          result.warnings.push(
            `Jobber "${name}" has unknown category "${category}" — skipped.`,
          );
        }
      } catch (err) {
        console.error(`[jobber-sync] failed for "${name}":`, err);
        result.skipped++;
        result.warnings.push(
          `"${name}": ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }

    cursor = data.productOrServices.pageInfo.hasNextPage
      ? data.productOrServices.pageInfo.endCursor
      : null;
  } while (cursor);

  return result;
}

async function upsertItem(
  jobberId: string,
  name: string,
  description: string,
  unitCost: Prisma.Decimal | null,
  ctx: {
    itemIdByJobberId: Map<string, string>;
    itemIdByName: Map<string, string>;
    result: InventorySyncResult;
  },
) {
  // Only these three fields are owned by Jobber.
  const jobberFields = { name, description, unitCost };

  const existingByJobberId = ctx.itemIdByJobberId.get(jobberId);
  if (existingByJobberId) {
    await prisma.item.update({
      where: { id: existingByJobberId },
      data: jobberFields,
    });
    ctx.result.itemsUpdated++;
    return;
  }

  const nameKey = normalizeName(name);
  const claimable = ctx.itemIdByName.get(nameKey);
  if (claimable) {
    await prisma.item.update({
      where: { id: claimable },
      data: { ...jobberFields, jobberProductId: jobberId },
    });
    ctx.itemIdByJobberId.set(jobberId, claimable);
    ctx.itemIdByName.delete(nameKey);
    ctx.result.itemsUpdated++;
    return;
  }

  const created = await prisma.item.create({
    data: { ...jobberFields, jobberProductId: jobberId },
  });
  ctx.itemIdByJobberId.set(jobberId, created.id);
  ctx.result.itemsCreated++;
  ctx.result.createdItemNames.push(name);
}

async function upsertKit(
  jobberId: string,
  name: string,
  description: string,
  unitCost: Prisma.Decimal | null,
  ctx: {
    kitIdByJobberId: Map<string, string>;
    kitIdByName: Map<string, string>;
    result: InventorySyncResult;
  },
) {
  const jobberFields = { name, description, unitCost };

  const existingByJobberId = ctx.kitIdByJobberId.get(jobberId);
  if (existingByJobberId) {
    await prisma.kit.update({
      where: { id: existingByJobberId },
      data: jobberFields,
    });
    ctx.result.kitsUpdated++;
    return;
  }

  const nameKey = normalizeName(name);
  const claimable = ctx.kitIdByName.get(nameKey);
  if (claimable) {
    await prisma.kit.update({
      where: { id: claimable },
      data: { ...jobberFields, jobberProductId: jobberId },
    });
    ctx.kitIdByJobberId.set(jobberId, claimable);
    ctx.kitIdByName.delete(nameKey);
    ctx.result.kitsUpdated++;
    return;
  }

  const created = await prisma.kit.create({
    data: { ...jobberFields, jobberProductId: jobberId },
  });
  ctx.kitIdByJobberId.set(jobberId, created.id);
  ctx.result.kitsCreated++;
  ctx.result.createdKitNames.push(name);
}
