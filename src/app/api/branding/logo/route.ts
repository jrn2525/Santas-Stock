import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Serves the custom logo bytes stored in the Settings row. Public (the
// unauthenticated sign-in page renders it) — see the middleware matcher, which
// excludes /api/branding. Callers only hit this when settings.hasCustomLogo is
// true; otherwise they render the static /logo.png, so the 404 here is just a
// defensive fallback.
export async function GET() {
  const row = await prisma.settings.findUnique({
    where: { singleton: "singleton" },
    select: { logoData: true, logoMimeType: true },
  });

  if (!row?.logoData || !row.logoMimeType) {
    return new Response(null, { status: 404 });
  }

  return new Response(new Uint8Array(row.logoData), {
    status: 200,
    headers: {
      "Content-Type": row.logoMimeType,
      // Safe to cache hard: the image URL carries ?v=<updatedAt>, which changes
      // whenever settings are saved, so a replaced logo is fetched fresh.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
