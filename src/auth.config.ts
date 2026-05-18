import type { NextAuthConfig } from "next-auth";

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

      const isPublic = path.startsWith("/sign-in");

      if (isPublic) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/dashboard", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  session: { strategy: "jwt" },
  providers: [],
};
