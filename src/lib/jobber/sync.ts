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
