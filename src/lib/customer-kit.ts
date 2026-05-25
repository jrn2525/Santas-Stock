import type { Prisma } from "@prisma/client";

// Accepts either the base Prisma client or a transaction client — both
// expose the same model delegates.
type Db = Prisma.TransactionClient;

type ResolvedKit = { id: string; quantity: number; propertyId: string | null };

/**
 * Resolve the CustomerKit a job line should consume / restore / unwind.
 *
 * Multi-property customers keep separate totes per property, so we match
 * on (clientId, propertyId, kitId) exactly first. If the job is scoped to
 * a property but that property has no tote of its own, we fall back to the
 * client-level (null-property) tote — but we never match a *different*
 * property's tote.
 *
 * This MUST be used identically by allocation, completion, and reset:
 * because the resolution is deterministic, each step re-derives the same
 * tote without needing to store which one was consumed. Changing the rule
 * here (and only here) keeps the three lifecycle stages in lockstep.
 */
export async function findCustomerKit(
  db: Db,
  args: {
    clientId: string;
    propertyId: string | null;
    kitId: string;
    /** Only match totes currently in storage (used at allocation time). */
    inStorageOnly?: boolean;
  },
): Promise<ResolvedKit | null> {
  const base = {
    clientId: args.clientId,
    kitId: args.kitId,
    ...(args.inStorageOnly ? { status: "IN_STORAGE" as const } : {}),
  };
  const select = { id: true, quantity: true, propertyId: true };

  // 1. Exact property match (this also covers the null-property case).
  const exact = await db.customerKit.findFirst({
    where: { ...base, propertyId: args.propertyId },
    select,
  });
  if (exact) return exact;

  // 2. Fallback: a property-scoped job with no tote of its own may use the
  //    customer's client-level (unscoped) tote. Never falls back the other
  //    way, and never reaches another property's tote.
  if (args.propertyId !== null) {
    return db.customerKit.findFirst({
      where: { ...base, propertyId: null },
      select,
    });
  }

  return null;
}
