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

export function callbackUrlFor(origin: string): string {
  return `${origin}/api/jobber/callback`;
}
