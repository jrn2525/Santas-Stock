import { prisma } from "@/lib/prisma";
import { getETParts } from "@/lib/datetime";
import { runJobFlowSync } from "./run-sync";

// Tick twice a minute so interval drift / a slow tick can't skip a configured
// minute entirely. lastFiredKey is minute-granular, so the extra ticks within
// a minute don't double-fire.
const TICK_MS = 30_000;

function hhmm(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// The minute we last fired for, e.g. "2026-5-26-08:45", so a 60s ticker that
// lands twice in the same minute only fires once.
let lastFiredKey: string | null = null;

async function tick(): Promise<void> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { singleton: "singleton" },
      select: {
        autoSyncEnabled: true,
        autoSyncTimes: true,
        autoSyncDays: true,
      },
    });
    if (!settings?.autoSyncEnabled) return;
    if (settings.autoSyncTimes.length === 0 || settings.autoSyncDays.length === 0) {
      return;
    }

    const p = getETParts(new Date());
    const now = hhmm(p.hour, p.minute);
    const key = `${p.year}-${p.month}-${p.day}-${now}`;
    if (key === lastFiredKey) return;
    if (!settings.autoSyncDays.includes(p.weekday)) return;
    if (!settings.autoSyncTimes.includes(now)) return;

    // Mark fired synchronously before the (async) sync starts so overlapping
    // ticks in the same minute don't double-fire.
    lastFiredKey = key;
    console.log(`[auto-sync] firing scheduled sync at ${now} ET`);

    runJobFlowSync()
      .then(async (res) => {
        if (res.ran) {
          await prisma.settings
            .update({
              where: { singleton: "singleton" },
              data: { lastAutoSyncAt: new Date() },
            })
            .catch((err) =>
              console.error("[auto-sync] failed to record lastAutoSyncAt:", err),
            );
          const errs = res.phaseErrors.length
            ? ` with errors: ${res.phaseErrors.join("; ")}`
            : "";
          console.log(`[auto-sync] completed${errs}`);
        } else if (res.notConnected) {
          console.warn("[auto-sync] skipped — Jobber not connected");
        } else {
          console.log("[auto-sync] skipped — a sync was already running");
        }
      })
      .catch((err) => console.error("[auto-sync] run failed:", err));
  } catch (err) {
    console.error("[auto-sync] tick failed:", err);
  }
}

// Start the 1-minute ticker once per process. Guarded on globalThis so dev
// HMR / repeated instrumentation calls don't stack up multiple intervals.
export function startAutoSyncScheduler(): void {
  const g = globalThis as unknown as { __autoSyncStarted?: boolean };
  if (g.__autoSyncStarted) return;
  g.__autoSyncStarted = true;
  setInterval(() => void tick(), TICK_MS);
  console.log("[auto-sync] scheduler started (30-second ticker)");
}
