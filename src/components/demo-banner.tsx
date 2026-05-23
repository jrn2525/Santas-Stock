/**
 * Renders at the top of every authenticated page when the signed-in
 * user has role === "GUEST". A persistent visual reminder that the
 * account is read-only — guests can browse, click around, and look at
 * data, but mutation attempts are blocked server-side (the write-gated
 * actions all call assertRoleForAction(WRITE_ROLES)).
 *
 * Marked no-print so the banner doesn't intrude on any printed report
 * a guest happens to generate.
 */
export function DemoBanner() {
  return (
    <div className="mb-4 rounded-md border border-yellow-700/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200 no-print">
      <strong className="font-semibold">Demo mode.</strong> You&apos;re
      signed in as a guest — feel free to look around, but changes
      won&apos;t save.
    </div>
  );
}
