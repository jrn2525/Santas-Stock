import { NextResponse, type NextRequest } from "next/server";
import { requireRole, ADMIN_ROLES } from "@/lib/auth-helpers";
import { buildAuthorizeUrl, callbackUrlFor, getPublicOrigin } from "@/lib/jobber/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Live role + active check (requireRole re-queries the DB and redirects),
  // not the cached JWT role.
  await requireRole(ADMIN_ROLES);

  const origin = getPublicOrigin(req);
  const state = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl(state, callbackUrlFor(origin));

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("jobber_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
