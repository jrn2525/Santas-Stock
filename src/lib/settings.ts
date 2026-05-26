import { cache } from "react";
import { prisma } from "@/lib/prisma";

export type CalendarView = "week" | "month" | "day";
export type PickListWindow = "week" | "month" | "all";

// Code-level defaults. These mirror the DB column defaults and the values that
// were hardcoded across the app before Settings existed, so a missing row (a
// fresh database) yields exactly the prior behavior.
export const SETTINGS_DEFAULTS = {
  businessName: "Santa's Stock",
  calendarDefaultView: "week" as CalendarView,
  calendarHourStart: 7,
  calendarHourEnd: 21,
  defaultPageSize: 50,
  pickListDefaultWindow: "all" as PickListWindow,
  lowStockDefaultThreshold: 0,
  autoSyncEnabled: false,
  autoSyncTimes: [] as string[], // "HH:MM" ET, 15-min increments
  autoSyncDays: [] as number[], // 0=Sun..6=Sat
};

export type AppSettings = typeof SETTINGS_DEFAULTS & {
  hasCustomLogo: boolean;
  // updatedAt epoch ms (0 when no row yet). Used as the logo cache-buster.
  logoVersion: number;
  lastAutoSyncAt: Date | null;
};

// cache() dedupes the read within a single request render, so multiple
// components on one page share one query. Never selects logoData (the blob) —
// only the logo route handler reads the bytes.
export const getSettings = cache(async (): Promise<AppSettings> => {
  // Fail safe to defaults if the DB is unreachable or the table doesn't exist
  // yet (e.g. during `next build`, which runs before migrations are applied on
  // deploy). The app then behaves exactly as it did before Settings existed.
  let row;
  try {
    row = await prisma.settings.findUnique({
      where: { singleton: "singleton" },
      select: {
        businessName: true,
        logoMimeType: true,
        calendarDefaultView: true,
        calendarHourStart: true,
        calendarHourEnd: true,
        defaultPageSize: true,
        pickListDefaultWindow: true,
        lowStockDefaultThreshold: true,
        autoSyncEnabled: true,
        autoSyncTimes: true,
        autoSyncDays: true,
        lastAutoSyncAt: true,
        updatedAt: true,
      },
    });
  } catch {
    row = null;
  }

  if (!row) {
    return {
      ...SETTINGS_DEFAULTS,
      hasCustomLogo: false,
      logoVersion: 0,
      lastAutoSyncAt: null,
    };
  }

  return {
    businessName: row.businessName,
    calendarDefaultView: row.calendarDefaultView as CalendarView,
    calendarHourStart: row.calendarHourStart,
    calendarHourEnd: row.calendarHourEnd,
    defaultPageSize: row.defaultPageSize,
    pickListDefaultWindow: row.pickListDefaultWindow as PickListWindow,
    lowStockDefaultThreshold: row.lowStockDefaultThreshold,
    autoSyncEnabled: row.autoSyncEnabled,
    autoSyncTimes: row.autoSyncTimes,
    autoSyncDays: row.autoSyncDays,
    hasCustomLogo: row.logoMimeType != null,
    logoVersion: row.updatedAt.getTime(),
    lastAutoSyncAt: row.lastAutoSyncAt,
  };
});

// Same-origin URL for the current logo, with a cache-buster so a replaced logo
// shows immediately. Callers should only use this when hasCustomLogo is true.
export function logoUrl(version: number): string {
  return `/api/branding/logo?v=${version}`;
}
