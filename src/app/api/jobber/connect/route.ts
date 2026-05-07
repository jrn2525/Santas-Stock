import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { buildAuthorizeUrl, callbackUrlFor } from "@/lib/jobber/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }

  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl(state, callbackUrlFor(origin));

  const response = NextResponse.redirect(authorizeUrl);
  // CSRF protection: signed-state cookie checked on the callback.
  response.cookies.set("jobber_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
  return response;
}
