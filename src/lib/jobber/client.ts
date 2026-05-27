import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
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

// Jobber rotates the refresh token on every use, so concurrent refreshes are
// dangerous: the first invalidates the token the others are holding. The notes
// sync alone fires 4 jobberQuery calls at once, each of which calls
// getValidAccessToken. We funnel all concurrent refreshes through a single
// in-flight promise so the refresh token is spent exactly once.
let refreshInFlight: Promise<string> | null = null;

async function refreshAndStore(): Promise<string> {
  const conn = await prisma.jobberConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  });
  if (!conn) throw new JobberNotConnectedError();

  // A refresh that ran just before us may have already renewed the token.
  // Re-check here (inside the single-flight) so a caller that observed a
  // stale "expiring" snapshot doesn't refresh again with a now-rotated token.
  if (conn.expiresAt.getTime() >= Date.now() + REFRESH_THRESHOLD_MS) {
    return decryptSecret(conn.accessToken);
  }

  const fresh = await refreshAccessToken(decryptSecret(conn.refreshToken));
  await prisma.jobberConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: encryptSecret(fresh.access_token),
      refreshToken: encryptSecret(fresh.refresh_token),
      expiresAt: computeTokenExpiry(fresh),
      scopes: extractScopes(fresh),
    },
  });
  return fresh.access_token;
}

async function getValidAccessToken(): Promise<string> {
  const conn = await prisma.jobberConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  });
  if (!conn) throw new JobberNotConnectedError();

  const expiringSoon =
    conn.expiresAt.getTime() < Date.now() + REFRESH_THRESHOLD_MS;
  if (!expiringSoon) {
    return decryptSecret(conn.accessToken);
  }

  // Coalesce concurrent refreshes onto one promise. The check-and-set below
  // has no `await` between them, so only the first caller starts the refresh;
  // the rest await the same result.
  if (!refreshInFlight) {
    refreshInFlight = refreshAndStore().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

type GraphQLError = { message: string; path?: (string | number)[] };

type ThrottleStatus = {
  maximumAvailable: number;
  currentlyAvailable: number;
  restoreRate: number;
};

type CostExtensions = {
  cost?: {
    requestedQueryCost?: number;
    actualQueryCost?: number;
    throttleStatus?: ThrottleStatus;
  };
};

// Jobber uses a cost-based GraphQL throttle. We read throttleStatus from
// every response to wait exactly long enough for the bucket to refill,
// plus a small proactive pause after successful calls that drained it.
const MAX_THROTTLE_RETRIES = 6;
const MAX_TRANSIENT_RETRIES = 3;
const SINGLE_WAIT_CAP_MS = 60_000;
const LOW_BUDGET_THRESHOLD = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function jobberQuery<TData = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<TData> {
  let transientRetries = 0;

  for (let attempt = 0; attempt <= MAX_THROTTLE_RETRIES; attempt++) {
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
      // 502/503/504 from Jobber/Cloudflare are transient — retry a few times
      // before surfacing.
      if (
        (res.status === 502 || res.status === 503 || res.status === 504) &&
        transientRetries < MAX_TRANSIENT_RETRIES
      ) {
        transientRetries++;
        const backoffMs = 2000 * 2 ** (transientRetries - 1);
        console.warn(
          `[jobber] ${res.status} from Jobber — waiting ${backoffMs / 1000}s before retry ${transientRetries}/${MAX_TRANSIENT_RETRIES}`,
        );
        await sleep(backoffMs);
        attempt--; // don't consume a throttle-retry slot
        continue;
      }
      const text = await res.text();
      throw new JobberError(`Jobber API ${res.status}: ${text}`);
    }

    const json = (await res.json()) as {
      data?: TData;
      errors?: GraphQLError[];
      extensions?: CostExtensions;
    };

    const throttled = json.errors?.some((e) => /Throttled/i.test(e.message));
    if (throttled) {
      if (attempt === MAX_THROTTLE_RETRIES) {
        throw new JobberError(
          `Jobber GraphQL error: Throttled (gave up after ${attempt + 1} attempts)`,
        );
      }
      const status = json.extensions?.cost?.throttleStatus;
      const requested = json.extensions?.cost?.requestedQueryCost ?? 1000;
      const waitMs = status
        ? Math.ceil(
            ((requested - status.currentlyAvailable) / Math.max(status.restoreRate, 1) + 1) *
              1000,
          )
        : 2000 * 2 ** attempt;
      const cappedMs = Math.min(Math.max(waitMs, 2000), SINGLE_WAIT_CAP_MS);
      console.warn(
        `[jobber] throttled — waiting ${Math.round(cappedMs / 1000)}s before retry ${attempt + 1}/${MAX_THROTTLE_RETRIES}`,
      );
      await sleep(cappedMs);
      continue;
    }

    if (json.errors?.length) {
      throw new JobberError(
        `Jobber GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`,
      );
    }
    if (!json.data) {
      throw new JobberError("Jobber returned no data.");
    }

    // Proactive pacing: caller will issue the next page right after we
    // return, so if we're under the threshold, breathe now to avoid
    // re-throttling on the very next call.
    const status = json.extensions?.cost?.throttleStatus;
    if (status && status.currentlyAvailable < LOW_BUDGET_THRESHOLD) {
      const refillMs = Math.ceil(
        ((LOW_BUDGET_THRESHOLD - status.currentlyAvailable) /
          Math.max(status.restoreRate, 1)) *
          1000,
      );
      await sleep(Math.min(refillMs, SINGLE_WAIT_CAP_MS));
    }

    return json.data;
  }
  throw new JobberError("Jobber GraphQL error: Throttled (unreachable)");
}
