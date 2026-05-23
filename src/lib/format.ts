/**
 * Format any numeric value as a string with exactly 2 decimal places.
 * Applied app-wide per UX convention: every numeric input box and every
 * numeric display (quantity, count, cost) renders 2 decimals.
 */
export function to2Dp(n: number | string | { toString(): string } | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0.00";
  const num = typeof n === "number" ? n : Number(n.toString());
  if (Number.isNaN(num)) return "0.00";
  return num.toFixed(2);
}
