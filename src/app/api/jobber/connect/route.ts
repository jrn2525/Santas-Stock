import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildAuthorizeUrl, callbackUrlFor, getPublicOrigin } from "@/lib/jobber/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

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
