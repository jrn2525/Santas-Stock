import type { NextAuthConfig } from "next-auth";
// NextResponse (not the bare Web `Response`) is Next's own middleware redirect.
// It's what the client router understands: a plain `Response.redirect` sends
// HTML back to an in-app navigation, which expects an RSC payload, and the page
// dies with "An unexpected response was received from the server." That's what
// a user with a temporary password hit on every sidebar click.
import { NextResponse } from "next/server";

// Edge-compatible config used by middleware. Must NOT import Node-only
// modules (like bcryptjs or @prisma/client). The full config in src/auth.ts
// extends this with the Credentials provider.
export const authConfig: NextAuthConfig = {
  // Required when running behind a reverse proxy (Railway, Fly, custom).
  // Without this, NextAuth v5 returns "There was a problem with the server
  // configuration" because it can't verify the request host.
  trustHost: true,
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;

      const isSignIn = path.startsWith("/sign-in");
      const isChangePassword = path === "/account/change-password";

      if (isSignIn) {
        if (isLoggedIn) {
          return NextResponse.redirect(new URL("/job-flow/dashboard", nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) return false;

      if (auth.user.mustChangePassword && !isChangePassword) {
        return NextResponse.redirect(new URL("/account/change-password", nextUrl));
      }

      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.mustChangePassword = user.mustChangePassword;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.mustChangePassword = token.mustChangePassword;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  providers: [],
};
