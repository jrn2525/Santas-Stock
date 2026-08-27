/**
 * Customer name formatting.
 *
 * Warehouse totes are labeled last name first ("Walters, Aaron"), so the app
 * shows names the same way — a picker reads the screen and the shelf in the
 * same order without mentally flipping anything.
 *
 * Businesses are shown by their company name exactly as Jobber has it: that's
 * the identity on a commercial tote, and it's also what the app has always
 * displayed for them (Client.name is derived as companyName || "first last").
 */

export type CustomerNameParts = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
};

/**
 * Prisma `select` for exactly the fields customerLabel needs. Use wherever a
 * query loads a client for display: `client: { select: customerNameSelect }`.
 */
export const customerNameSelect = {
  name: true,
  firstName: true,
  lastName: true,
  companyName: true,
} as const;

const clean = (v: string | null | undefined): string => v?.trim() ?? "";

/**
 * Single-line label, last name first. Use anywhere there's only room for one
 * value (job headers, calendar entries, dashboards, printouts). Tables with
 * room for separate columns should render the parts directly instead.
 */
export function customerLabel(c: CustomerNameParts | null | undefined): string {
  if (!c) return "—";

  // A business is known by its company name — leave it exactly as-is.
  const company = clean(c.companyName);
  if (company) return company;

  const first = clean(c.firstName);
  const last = clean(c.lastName);
  if (last && first) return `${last}, ${first}`;
  if (last) return last;
  if (first) return first;

  return clean(c.name) || "—";
}

/**
 * Same as customerLabel but returns "" instead of "—" when there's no name.
 * Use where the caller tests for a name before rendering (`label && <…>`) or
 * builds a composite string like a tooltip, so a missing name contributes
 * nothing rather than a stray dash.
 */
export function customerLabelOrEmpty(
  c: CustomerNameParts | null | undefined,
): string {
  const label = customerLabel(c);
  return label === "—" ? "" : label;
}

/**
 * The value the customer list sorts on, mirrored into Client.sortName at sync
 * time so the database can order (and therefore paginate) by it: last name for
 * people, company name for businesses.
 */
export function customerSortName(c: CustomerNameParts): string {
  return clean(c.lastName) || clean(c.companyName) || clean(c.name);
}
