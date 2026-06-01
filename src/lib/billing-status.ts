import type { Prisma } from "@prisma/client";

// Derives the Jobs-list "Billing Status" from a job's raw Jobber invoice
// status (JobberJob.invoiceStatus). Jobber has no single billingStatus enum;
// the label here mirrors what the Jobber UI shows on a job's Billing section.
//
// Buckets:
//   Upcoming         — no invoice yet, or an invoice that's still a draft
//   Awaiting payment — invoice issued but not fully paid (awaiting_payment,
//                      past_due, bad_debt, etc.)
//   Paid             — invoice fully paid
//
// The match is casing/format tolerant so it survives Jobber enum changes: we
// only special-case the two literals we care about ("paid", "draft") and treat
// every other invoiced state as awaiting payment.

export type BillingStatusKey = "upcoming" | "awaiting" | "paid";

export const BILLING_STATUS_LABELS: Record<BillingStatusKey, string> = {
  upcoming: "Upcoming",
  awaiting: "Awaiting payment",
  paid: "Paid",
};

export const BILLING_STATUS_OPTIONS: BillingStatusKey[] = [
  "upcoming",
  "awaiting",
  "paid",
];

function normalize(invoiceStatus: string): string {
  return invoiceStatus.toUpperCase().replace(/[^A-Z]/g, "");
}

export function billingStatusKey(
  invoiceStatus: string | null | undefined,
): BillingStatusKey {
  if (!invoiceStatus) return "upcoming";
  const n = normalize(invoiceStatus);
  if (n === "PAID") return "paid";
  if (n === "DRAFT") return "upcoming";
  return "awaiting";
}

export function billingStatusLabel(
  invoiceStatus: string | null | undefined,
): string {
  return BILLING_STATUS_LABELS[billingStatusKey(invoiceStatus)];
}

// Prisma `where` fragment for filtering the Jobs list by billing status.
// Mirrors billingStatusKey() exactly so the filter and the displayed badge
// never disagree.
export function billingStatusWhere(
  key: BillingStatusKey,
): Prisma.JobberJobWhereInput {
  const isPaid: Prisma.JobberJobWhereInput = {
    invoiceStatus: { equals: "paid", mode: "insensitive" },
  };
  const isDraft: Prisma.JobberJobWhereInput = {
    invoiceStatus: { equals: "draft", mode: "insensitive" },
  };
  switch (key) {
    case "upcoming":
      // no invoice, or a draft invoice
      return { OR: [{ invoiceStatus: null }, isDraft] };
    case "paid":
      return isPaid;
    case "awaiting":
      // has an invoice, but it's neither paid nor a draft
      return {
        AND: [{ invoiceStatus: { not: null } }, { NOT: isPaid }, { NOT: isDraft }],
      };
  }
}
