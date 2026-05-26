// Runs once when the server process starts. We use it to launch the in-process
// Jobber auto-sync scheduler. Guarded to the Node.js runtime so the Edge
// runtime never tries to load Prisma / Node-only code.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAutoSyncScheduler } = await import(
    "@/lib/jobber/auto-sync-scheduler"
  );
  startAutoSyncScheduler();
}
