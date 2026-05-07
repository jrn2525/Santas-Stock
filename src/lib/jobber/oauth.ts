// Thin wrappers around Jobber's OAuth 2.0 endpoints.
// Docs: https://developer.getjobber.com/docs/building_your_app/app_authorization/

const JOBBER_AUTHORIZE_URL = "https://api.getjobber.com/api/oauth/authorize";
const JOBBER_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";

export type JobberTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  token_type: string;
  scope?: string;
};

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

// Returns the public origin for this app, honoring forwarded headers when
// running behind a proxy (Railway, Fly, etc.). Without this, req.url inside
// a containerized Next.js app reports the internal hostname (localhost:8080),
// which would break OAuth round trips.
export function getPublicOrigin(req: { headers: Headers; url: string }): string {
  if (process.env.PUBLIC_APP_URL) {
    return process.env.PUBLIC_APP_URL.replace(/\/+$/, "");
  }

  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }

  return new URL(req.url).origin;
}

export function callbackUrlFor(origin: string): string {
  return `${origin}/api/jobber/callback`;
}

// Jobber's access tokens are JWTs whose `exp` and `scope` claims are
// authoritative — the OAuth response doesn't always include those at the
// top level. Decode the payload (no signature check; we trust the issuer
// because the token came from Jobber over HTTPS).
type JobberAccessTokenPayload = {
  exp?: number;
  scope?: string;
  account_id?: number | string;
  user_id?: number | string;
};

function decodeAccessToken(token: string): JobberAccessTokenPayload | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1] + "=".repeat((4 - (parts[1].length % 4)) % 4);
    const json = Buffer.from(
      padded.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf-8");
    return JSON.parse(json) as JobberAccessTokenPayload;
  } catch {
    return null;
  }
}

export function computeTokenExpiry(tokens: JobberTokenResponse): Date {
  if (typeof tokens.expires_in === "number" && tokens.expires_in > 0) {
    return new Date(Date.now() + tokens.expires_in * 1000);
  }
  const claims = decodeAccessToken(tokens.access_token);
  if (claims?.exp && Number.isFinite(claims.exp)) {
    return new Date(claims.exp * 1000);
  }
  // Last-resort fallback: refresh in an hour. Better than crashing.
  return new Date(Date.now() + 60 * 60 * 1000);
}

export function extractScopes(tokens: JobberTokenResponse): string[] {
  if (tokens.scope) {
    return tokens.scope.split(/[\s,]+/).filter(Boolean);
  }
  const claims = decodeAccessToken(tokens.access_token);
  if (claims?.scope) {
    return claims.scope.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}

export function extractAccountId(tokens: JobberTokenResponse): string | null {
  const claims = decodeAccessToken(tokens.access_token);
  if (claims?.account_id !== undefined && claims.account_id !== null) {
    return String(claims.account_id);
  }
  return null;
}

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("JOBBER_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  return `${JOBBER_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<JobberTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("JOBBER_CLIENT_ID"),
    client_secret: requireEnv("JOBBER_CLIENT_SECRET"),
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber token exchange failed (${res.status}): ${text}`);
  }

  return (await res.json()) as JobberTokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<JobberTokenResponse> {
  const body = new URLSearchParams({
    client_id: requireEnv("JOBBER_CLIENT_ID"),
    client_secret: requireEnv("JOBBER_CLIENT_SECRET"),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetch(JOBBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jobber refresh failed (${res.status}): ${text}`);
  }

  return (await res.json()) as JobberTokenResponse;
}
