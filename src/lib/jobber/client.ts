import { prisma } from "@/lib/prisma";
import {
  computeTokenExpiry,
  extractScopes,
  refreshAccessToken,
} from "./oauth";

const JOBBER_API_URL = "https://api.getjobber.com/api/graphql";

// Pin a specific API version. Update when we want new fields.
// See: https://developer.getjobber.com/docs/changelog/
const JOBBER_API_VERSION = "2025-04-16";

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // refresh if <5 min to expiry

class JobberError extends Error {}

export class JobberNotConnectedError extends JobberError {
  constructor() {
    super("Jobber is not connected. Connect on the /jobber page.");
  }
}

async function getValidAccessToken(): Promise<string> {
  const conn = await prisma.jobberConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  });
  if (!conn) throw new JobberNotConnectedError();

  const expiringSoon =
    conn.expiresAt.getTime() < Date.now() + REFRESH_THRESHOLD_MS;
  if (!expiringSoon) {
    return conn.accessToken;
  }

  const fresh = await refreshAccessToken(conn.refreshToken);
  await prisma.jobberConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token,
      expiresAt: computeTokenExpiry(fresh),
      scopes: extractScopes(fresh),
    },
  });
  return fresh.access_token;
}

type GraphQLError = { message: string; path?: (string | number)[] };

// Jobber uses a cost-based GraphQL throttle. On "Throttled" we back off and
// retry; everything else fails fast.
const MAX_THROTTLE_RETRIES = 4;

function isThrottled(err: unknown): boolean {
  return err instanceof JobberError && /Throttled/i.test(err.message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function jobberQuery<TData = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<TData> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt++) {
    try {
      return await jobberQueryOnce<TData>(query, variables);
    } catch (err) {
      lastErr = err;
      if (!isThrottled(err) || attempt === MAX_THROTTLE_RETRIES) throw err;
      await sleep(2000 * 2 ** attempt); // 2s, 4s, 8s, 16s
    }
  }
  throw lastErr;
}

async function jobberQueryOnce<TData>(
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> {
  const accessToken = await getValidAccessToken();

  const res = await fetch(JOBBER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-JOBBER-GRAPHQL-VERSION": JOBBER_API_VERSION,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new JobberError(`Jobber API ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { data?: TData; errors?: GraphQLError[] };
  if (json.errors?.length) {
    throw new JobberError(
      `Jobber GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
    );
  }
  if (!json.data) {
    throw new JobberError("Jobber returned no data.");
  }
  return json.data;
}
