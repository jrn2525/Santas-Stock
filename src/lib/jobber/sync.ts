import { prisma } from "@/lib/prisma";
import { jobberQuery } from "./client";

const CLIENTS_QUERY = /* GraphQL */ `
  query SyncClients($cursor: String) {
    clients(first: 100, after: $cursor) {
      nodes {
        id
        firstName
        lastName
        companyName
        emails {
          primary
          address
        }
        phones {
          primary
          number
        }
        properties(first: 50) {
          nodes {
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
  emails: Array<{ primary: boolean; address: string }> | null;
  phones: Array<{ primary: boolean; number: string }> | null;
  properties: {
    nodes: Array<{ id: string; address: JobberAddress | null }>;
  } | null;
};

type ClientsResponse = {
  clients: {
    nodes: JobberClientNode[];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};

function deriveName(node: JobberClientNode): string {
  if (node.companyName) return node.companyName;
  const personal = [node.firstName, node.lastName].filter(Boolean).join(" ").trim();
  if (personal) return personal;
  return "(unnamed)";
}

function pickPrimaryEmail(
  list: JobberClientNode["emails"],
): { primary: boolean; address: string } | null {
  if (!list || list.length === 0) return null;
  return list.find((entry) => entry.primary) ?? list[0];
}

function pickPrimaryPhone(
  list: JobberClientNode["phones"],
): { primary: boolean; number: string } | null {
  if (!list || list.length === 0) return null;
  return list.find((entry) => entry.primary) ?? list[0];
}

function formatAddress(addr: JobberAddress | null): string {
  if (!addr) return "";
  const line = [addr.street, addr.city, addr.province, addr.postalCode, addr.country]
    .filter((p) => p && p.trim().length > 0)
    .join(", ");
  return line;
}

export type SyncResult = {
  clientsUpserted: number;
  propertiesUpserted: number;
};

export async function syncClientsAndProperties(): Promise<SyncResult> {
  let cursor: string | null = null;
  let clientsUpserted = 0;
  let propertiesUpserted = 0;
  const now = new Date();

  do {
    const data: ClientsResponse = await jobberQuery<ClientsResponse>(
      CLIENTS_QUERY,
      { cursor },
    );
    for (const node of data.clients.nodes) {
      const primaryEmail = pickPrimaryEmail(node.emails)?.address ?? null;
      const primaryPhone = pickPrimaryPhone(node.phones)?.number ?? null;

      const client = await prisma.client.upsert({
        where: { jobberClientId: node.id },
        update: {
          name: deriveName(node),
          companyName: node.companyName,
          email: primaryEmail,
          phone: primaryPhone,
          syncedAt: now,
        },
        create: {
          jobberClientId: node.id,
          name: deriveName(node),
          companyName: node.companyName,
          email: primaryEmail,
          phone: primaryPhone,
          syncedAt: now,
        },
      });
      clientsUpserted++;

      const propertyNodes = node.properties?.nodes ?? [];
      for (const prop of propertyNodes) {
        await prisma.property.upsert({
          where: { jobberPropertyId: prop.id },
          update: {
            address: formatAddress(prop.address),
            clientId: client.id,
            syncedAt: now,
          },
          create: {
            jobberPropertyId: prop.id,
            address: formatAddress(prop.address),
            clientId: client.id,
            syncedAt: now,
          },
        });
        propertiesUpserted++;
      }
    }
    cursor = data.clients.pageInfo.hasNextPage ? data.clients.pageInfo.endCursor : null;
  } while (cursor);

  return { clientsUpserted, propertiesUpserted };
}
