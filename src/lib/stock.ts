import { Prisma } from "@prisma/client";

/**
 * Atomically deduct up to `needed` units from an item's stock, never driving
 * quantity below zero — even when two *different* jobs allocate the same item
 * concurrently. A plain read-then-`decrement` is unsafe: at Read Committed,
 * two transactions can both read the same `available` and both decrement the
 * full amount, leaving quantity negative. The guarded `updateMany`
 * (`where: quantity >= want`) deducts only if enough remains; Postgres row
 * locking serializes the writers and the retry handles a lost race.
 *
 * Must be called inside a transaction. Returns the amount actually deducted
 * (caller records `needed - deducted` as a shortage).
 */
export async function deductStock(
  tx: Prisma.TransactionClient,
  itemId: string,
  needed: number,
): Promise<number> {
  if (needed <= 0) return 0;
  for (let attempt = 0; attempt < 5; attempt++) {
    const fresh = await tx.item.findUnique({
      where: { id: itemId },
      select: { quantity: true },
    });
    const available = fresh?.quantity ?? 0;
    const want = Math.min(available, needed);
    if (want <= 0) return 0;
    const res = await tx.item.updateMany({
      where: { id: itemId, quantity: { gte: want } },
      data: { quantity: { decrement: want } },
    });
    if (res.count === 1) return want;
    // Lost a race against a concurrent deduction — re-read and retry.
  }
  return 0;
}
