import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  callbackUrlFor,
  exchangeCodeForTokens,
  getPublicOrigin,
} from "@/lib/jobber/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const origin = getPublicOrigin(req);

  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", origin));
  }

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

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  const scopes = tokens.scope ? tokens.scope.split(/[\s,]+/).filter(Boolean) : [];

  await prisma.$transaction([
    prisma.jobberConnection.deleteMany({}),
    prisma.jobberConnection.create({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scopes,
        connectedById: session.user.id,
      },
    }),
  ]);

  const response = redirectToJobberPage(origin, "connected=1");
  response.cookies.delete("jobber_oauth_state");
  return response;
}

function redirectToJobberPage(origin: string, qs: string) {
  return NextResponse.redirect(new URL(`/jobber?${qs}`, origin));
}
