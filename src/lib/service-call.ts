// A "Service Call" is a labor-only pick-list line (no physical inventory, no
// cost). A job whose pick list contains a Service Call line uses the
// simplified 3-step Service Call flow (Service Call → Scheduled Service Call →
// Completed Service Call) instead of the normal Job Flow, and — per the agreed
// spec — such jobs are labor-only (no other items).
import type { Prisma } from "@prisma/client";

export const SERVICE_CALL_NAME = "service call";

type LineNameSource = {
  item?: { name: string } | null;
  rawName?: string | null;
};

/** True if this pick-list line is the "Service Call" line (match by name). */
export function isServiceCallLine(line: LineNameSource): boolean {
  const name = (line.item?.name ?? line.rawName ?? "").trim().toLowerCase();
  return name === SERVICE_CALL_NAME;
}

/** True if any line on the job is a Service Call. */
export function jobHasServiceCall(lines: LineNameSource[]): boolean {
  return lines.some(isServiceCallLine);
}

/**
 * Prisma `where` fragment matching jobs that HAVE a Service Call line (matched
 * case-insensitively, by linked item name or raw line name). Use
 * `{ NOT: serviceCallJobWhere }` to exclude Service Call jobs from the
 * inventory/allocation workflow views (Job Flow board, Pick List) where a
 * labor-only job doesn't belong.
 */
export const serviceCallJobWhere: Prisma.JobberJobWhereInput = {
  lineItems: {
    some: {
      OR: [
        {
          item: {
            is: { name: { equals: SERVICE_CALL_NAME, mode: "insensitive" } },
          },
        },
        { rawName: { equals: SERVICE_CALL_NAME, mode: "insensitive" } },
      ],
    },
  },
};
