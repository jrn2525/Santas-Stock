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

// ---------------------------------------------------------------------------
// Jobs sync
// ---------------------------------------------------------------------------
//
// Pulls every Job from Jobber, matched by jobberJobId. Requires Customer
// sync to have run first so clients/properties exist locally.

const JOBS_QUERY = /* GraphQL */ `
  query SyncJobs($cursor: String) {
    jobs(first: 25, after: $cursor) {
      nodes {
        id
        title
        jobNumber
        description
        instructions
        total
        startAt
        endAt
        jobStatus
        client { id }
        property { id }
        lineItems {
          nodes {
            id
            name
            description
            quantity
            productOrService { id }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type JobberLineItemNode = {
  id: string;
  name: string | null;
  description: string | null;
  quantity: number | string | null;
  productOrService: { id: string } | null;
};

type JobberJobNode = {
  id: string;
  title: string | null;
  jobNumber: string | null;
  description: string | null;
  instructions: string | null;
  total: number | string | null;
  startAt: string | null;
  endAt: string | null;
  jobStatus: string | null;
  client: { id: string } | null;
  property: { id: string } | null;
  lineItems: { nodes: JobberLineItemNode[] } | null;
};

type JobsResponse = {
  jobs: {
    nodes: JobberJobNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type JobsSyncResult = {
  upserted: number;
  skipped: number;
  warnings: string[];
};

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toDecimal(v: number | string | null): Prisma.Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  if (Number.isNaN(Number(v))) return null;
  return new Prisma.Decimal(String(v));
}

export async function syncJobs(): Promise<JobsSyncResult> {
  const result: JobsSyncResult = { upserted: 0, skipped: 0, warnings: [] };
  const now = new Date();

  // Pre-load client & property maps + Item/Kit Jobber-id maps so line items
  // can be resolved to local rows without a per-line lookup.
  const [clients, properties, items, kits] = await Promise.all([
    prisma.client.findMany({ select: { id: true, jobberClientId: true } }),
    prisma.property.findMany({ select: { id: true, jobberPropertyId: true } }),
    prisma.item.findMany({
      where: { jobberProductId: { not: null } },
      select: { id: true, jobberProductId: true },
    }),
    prisma.kit.findMany({
      where: { jobberProductId: { not: null } },
      select: { id: true, jobberProductId: true },
    }),
  ]);
  const clientIdByJobberId = new Map(clients.map((c) => [c.jobberClientId, c.id]));
  const propIdByJobberId = new Map(
    properties.map((p) => [p.jobberPropertyId, p.id]),
  );
  const itemIdByJobberProductId = new Map(
    items
      .filter((i): i is { id: string; jobberProductId: string } => !!i.jobberProductId)
      .map((i) => [i.jobberProductId, i.id]),
  );
  const kitIdByJobberProductId = new Map(
    kits
      .filter((k): k is { id: string; jobberProductId: string } => !!k.jobberProductId)
      .map((k) => [k.jobberProductId, k.id]),
  );

  let cursor: string | null = null;
  do {
    const data: JobsResponse = await jobberQuery<JobsResponse>(JOBS_QUERY, {
      cursor,
    });
    for (const node of data.jobs.nodes) {
      const clientLocalId = node.client
        ? clientIdByJobberId.get(node.client.id)
        : undefined;
      if (!clientLocalId) {
        result.skipped++;
        result.warnings.push(
          `Job ${node.jobNumber ?? node.id}: client not in Santa's Stock yet. Run Sync Customers first.`,
        );
        continue;
      }
      const propertyLocalId = node.property
        ? propIdByJobberId.get(node.property.id) ?? null
        : null;

      const data_ = {
        title: node.title?.trim() || null,
        jobNumber: node.jobNumber?.trim() || null,
        description: node.description?.trim() || null,
        instructions: node.instructions?.trim() || null,
        total: toDecimal(node.total),
        startAt: toDate(node.startAt),
        endAt: toDate(node.endAt),
        clientId: clientLocalId,
        propertyId: propertyLocalId,
        status: node.jobStatus ?? "",
        syncedAt: now,
      };

      try {
        const upserted = await prisma.jobberJob.upsert({
          where: { jobberJobId: node.id },
          update: data_,
          create: { jobberJobId: node.id, ...data_ },
        });
        result.upserted++;

        // Replace the line items for this job. Simpler than diffing — line
        // items are small in count per job and cheap to wipe + recreate.
        await prisma.jobLineItem.deleteMany({ where: { jobId: upserted.id } });
        const lineNodes = node.lineItems?.nodes ?? [];
        for (let pos = 0; pos < lineNodes.length; pos++) {
          const li = lineNodes[pos];
          const linkedJobberId = li.productOrService?.id ?? null;
          const itemId = linkedJobberId
            ? itemIdByJobberProductId.get(linkedJobberId) ?? null
            : null;
          const kitId =
            !itemId && linkedJobberId
              ? kitIdByJobberProductId.get(linkedJobberId) ?? null
              : null;
          await prisma.jobLineItem.create({
            data: {
              jobberLineItemId: li.id,
              jobId: upserted.id,
              itemId,
              kitId,
              rawName: li.name?.trim() || null,
              quantity:
                toDecimal(li.quantity) ?? new Prisma.Decimal("1"),
              notes: li.description?.trim() || null,
              position: pos,
            },
          });
        }
      } catch (err) {
        console.error(`[jobber-sync] job ${node.id}:`, err);
        result.skipped++;
        result.warnings.push(
          `Job ${node.jobNumber ?? node.id}: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }
    cursor = data.jobs.pageInfo.hasNextPage
      ? data.jobs.pageInfo.endCursor
      : null;
  } while (cursor);

  return result;
}

// ---------------------------------------------------------------------------
// Visits sync
// ---------------------------------------------------------------------------

const VISITS_QUERY = /* GraphQL */ `
  query SyncVisits($cursor: String) {
    visits(first: 25, after: $cursor) {
      nodes {
        id
        title
        instructions
        startAt
        endAt
        visitStatus
        job { id }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

type JobberVisitNode = {
  id: string;
  title: string | null;
  instructions: string | null;
  startAt: string | null;
  endAt: string | null;
  visitStatus: string | null;
  job: { id: string } | null;
};

type VisitsResponse = {
  visits: {
    nodes: JobberVisitNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

export type VisitsSyncResult = {
  upserted: number;
  skipped: number;
  warnings: string[];
};

export async function syncVisits(): Promise<VisitsSyncResult> {
  const result: VisitsSyncResult = { upserted: 0, skipped: 0, warnings: [] };
  const now = new Date();

  const jobs = await prisma.jobberJob.findMany({
    select: { id: true, jobberJobId: true },
  });
  const jobIdByJobberId = new Map(jobs.map((j) => [j.jobberJobId, j.id]));

  let cursor: string | null = null;
  do {
    const data: VisitsResponse = await jobberQuery<VisitsResponse>(
      VISITS_QUERY,
      { cursor },
    );
    for (const node of data.visits.nodes) {
      const jobLocalId = node.job ? jobIdByJobberId.get(node.job.id) : undefined;
      if (!jobLocalId) {
        result.skipped++;
        result.warnings.push(
          `Visit ${node.id}: parent Job not synced yet. Run Sync Jobs first.`,
        );
        continue;
      }
      const data_ = {
        jobId: jobLocalId,
        title: node.title?.trim() || null,
        instructions: node.instructions?.trim() || null,
        startAt: toDate(node.startAt),
        endAt: toDate(node.endAt),
        status: node.visitStatus ?? "",
        syncedAt: now,
      };
      try {
        await prisma.jobberVisit.upsert({
          where: { jobberVisitId: node.id },
          update: data_,
          create: { jobberVisitId: node.id, ...data_ },
        });
        result.upserted++;
      } catch (err) {
        console.error(`[jobber-sync] visit ${node.id}:`, err);
        result.skipped++;
        result.warnings.push(
          `Visit ${node.id}: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      }
    }
    cursor = data.visits.pageInfo.hasNextPage
      ? data.visits.pageInfo.endCursor
      : null;
  } while (cursor);

  return result;
}

// ---------------------------------------------------------------------------
// Notes sync
// ---------------------------------------------------------------------------
//
// Jobber attaches notes to clients, jobs, and visits. We fetch each parent's
// notes via paginated sub-query. Each note is then upserted with its parent
// link recorded. Requires the corresponding parents to be synced first.

const CLIENT_NOTES_QUERY = /* GraphQL */ `
  query ClientNotes($id: EncodedId!, $cursor: String) {
    client(id: $id) {
      notes(first: 50, after: $cursor) {
        nodes { id message pinned createdAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const JOB_NOTES_QUERY = /* GraphQL */ `
  query JobNotes($id: EncodedId!, $cursor: String) {
    job(id: $id) {
      notes(first: 50, after: $cursor) {
        nodes { id message pinned createdAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const VISIT_NOTES_QUERY = /* GraphQL */ `
  query VisitNotes($id: EncodedId!, $cursor: String) {
    visit(id: $id) {
      notes(first: 50, after: $cursor) {
        nodes { id message pinned createdAt }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

type JobberNoteNode = {
  id: string;
  message: string | null;
  pinned: boolean | null;
  createdAt: string | null;
};

type NotesPage = {
  nodes: JobberNoteNode[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

export type NotesSyncResult = {
  upserted: number;
  skipped: number;
  warnings: string[];
};

async function fetchAllNotes(
  query: string,
  jobberParentId: string,
  pickConnection: (data: unknown) => NotesPage | null,
): Promise<JobberNoteNode[]> {
  const out: JobberNoteNode[] = [];
  let cursor: string | null = null;
  do {
    const data = await jobberQuery<unknown>(query, { id: jobberParentId, cursor });
    const page = pickConnection(data);
    if (!page) break;
    out.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return out;
}

export async function syncNotes(): Promise<NotesSyncResult> {
  const result: NotesSyncResult = { upserted: 0, skipped: 0, warnings: [] };
  const now = new Date();

  const [clients, jobs, visits] = await Promise.all([
    prisma.client.findMany({ select: { id: true, jobberClientId: true } }),
    prisma.jobberJob.findMany({ select: { id: true, jobberJobId: true } }),
    prisma.jobberVisit.findMany({ select: { id: true, jobberVisitId: true } }),
  ]);

  type Parent =
    | { kind: "client"; localId: string; jobberId: string }
    | { kind: "job"; localId: string; jobberId: string }
    | { kind: "visit"; localId: string; jobberId: string };

  const parents: Parent[] = [
    ...clients.map((c) => ({
      kind: "client" as const,
      localId: c.id,
      jobberId: c.jobberClientId,
    })),
    ...jobs.map((j) => ({
      kind: "job" as const,
      localId: j.id,
      jobberId: j.jobberJobId,
    })),
    ...visits.map((v) => ({
      kind: "visit" as const,
      localId: v.id,
      jobberId: v.jobberVisitId,
    })),
  ];

  // Modest concurrency to avoid hammering Jobber's API while still finishing
  // in a reasonable wall-clock time on large accounts.
  const CONCURRENCY = 4;
  for (let i = 0; i < parents.length; i += CONCURRENCY) {
    const batch = parents.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (p) => {
        const query =
          p.kind === "client"
            ? CLIENT_NOTES_QUERY
            : p.kind === "job"
              ? JOB_NOTES_QUERY
              : VISIT_NOTES_QUERY;

        try {
          const notes = await fetchAllNotes(query, p.jobberId, (data) => {
            const d = data as Record<string, { notes?: NotesPage } | null>;
            if (p.kind === "client") return d.client?.notes ?? null;
            if (p.kind === "job") return d.job?.notes ?? null;
            return d.visit?.notes ?? null;
          });

          for (const n of notes) {
            const body = n.message?.trim();
            if (!body) {
              result.skipped++;
              continue;
            }
            const link =
              p.kind === "client"
                ? { clientId: p.localId, jobId: null, visitId: null }
                : p.kind === "job"
                  ? { clientId: null, jobId: p.localId, visitId: null }
                  : { clientId: null, jobId: null, visitId: p.localId };
            const data_ = {
              body,
              isInternal: false, // Jobber API surfaces visibility differently; treat all as internal for now.
              noteCreatedAt: toDate(n.createdAt),
              ...link,
              syncedAt: now,
            };
            await prisma.jobberNote.upsert({
              where: { jobberNoteId: n.id },
              update: data_,
              create: { jobberNoteId: n.id, ...data_ },
            });
            result.upserted++;
          }
        } catch (err) {
          console.error(`[jobber-sync] notes for ${p.kind} ${p.jobberId}:`, err);
          result.skipped++;
          result.warnings.push(
            `${p.kind} ${p.jobberId}: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
      }),
    );
  }

  return result;
}
