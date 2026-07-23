import { NextResponse, type NextRequest } from "next/server";
import { requireRole, ADMIN_ROLES } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  callbackUrlFor,
  computeTokenExpiry,
  exchangeCodeForTokens,
  extractAccountId,
  extractScopes,
  getPublicOrigin,
} from "@/lib/jobber/oauth";
import { encryptSecret } from "@/lib/crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);

  // Live role + active check (requireRole re-queries the DB and redirects),
  // not the cached JWT role.
  const user = await requireRole(ADMIN_ROLES);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToJobberPage(origin, `error=${encodeURIComponent(error)}`);
  }

  if (!code || !state) {
    return redirectToJobberPage(origin, "error=missing_code");
  }

  const expectedState = req.cookies.get("jobber_oauth_state")?.value;
  if (!expectedState || expectedState !== state) {
    return redirectToJobberPage(origin, "error=invalid_state");
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, callbackUrlFor(origin));
  } catch (err) {
    console.error("Jobber token exchange failed:", err);
    return redirectToJobberPage(origin, "error=token_exchange");
  }

  const expiresAt = computeTokenExpiry(tokens);
  const scopes = extractScopes(tokens);
  const jobberAccountId = extractAccountId(tokens);

  await prisma.$transaction([
    prisma.jobberConnection.deleteMany({}),
    prisma.jobberConnection.create({
      data: {
        accessToken: encryptSecret(tokens.access_token),
        refreshToken: encryptSecret(tokens.refresh_token),
        expiresAt,
        scopes,
        jobberAccountId,
        connectedById: user.id,
      },
    }),
  ]);

  const response = redirectToJobberPage(origin, "connected=1");
  response.cookies.delete("jobber_oauth_state");
  return response;
}

function redirectToJobberPage(origin: string, qs: string) {
  return NextResponse.redirect(new URL(`/job-flow/jobber?${qs}`, origin));
}
