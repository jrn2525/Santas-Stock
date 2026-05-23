/**
 * Date/time helpers fixed to Eastern Time (America/New_York). DST handling is
 * delegated to Intl — no manual offset math.
 */

const TZ = "America/New_York";

/** Minutes east of UTC for the given timezone at the given instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - instant.getTime()) / 60000;
}

/** UTC instant for a wall-clock time in Eastern Time. */
export function etWallToUTC(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const off1 = offsetMinutes(naive, TZ);
  const corrected = new Date(naive.getTime() - off1 * 60000);
  const off2 = offsetMinutes(corrected, TZ);
  if (off2 !== off1) {
    return new Date(naive.getTime() - off2 * 60000);
  }
  return corrected;
}

export type ETParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun
};

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function getETParts(d: Date): ETParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: WEEKDAY_MAP[parts.weekday] ?? 0,
  };
}

export function todayET(): Date {
  const p = getETParts(new Date());
  return etWallToUTC(p.year, p.month, p.day);
}

/** YYYY-MM-DD for the ET date containing the given UTC instant. */
export function formatDateParam(d: Date): string {
  const p = getETParts(d);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Parses YYYY-MM-DD as start-of-day in ET. Falls back to today on invalid. */
export function parseDateParam(s: string | undefined): Date {
  if (!s) return todayET();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return todayET();
  return etWallToUTC(Number(m[1]), Number(m[2]), Number(m[3]));
}

export function startOfDayET(d: Date): Date {
  const p = getETParts(d);
  return etWallToUTC(p.year, p.month, p.day);
}

export function startOfNextDayET(d: Date): Date {
  return addDaysET(startOfDayET(d), 1);
}

export function addDaysET(d: Date, n: number): Date {
  const p = getETParts(d);
  // Date.UTC normalizes month/day overflow, but we still need TZ-aware conversion.
  const naive = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  const np = {
    year: naive.getUTCFullYear(),
    month: naive.getUTCMonth() + 1,
    day: naive.getUTCDate(),
  };
  return etWallToUTC(np.year, np.month, np.day);
}

/** Sunday-anchored week. */
export function startOfWeekET(d: Date): Date {
  const p = getETParts(d);
  return addDaysET(etWallToUTC(p.year, p.month, p.day), -p.weekday);
}

export function endOfWeekET(d: Date): Date {
  return addDaysET(startOfWeekET(d), 7);
}

/** First-of-month, ET. */
export function startOfMonthET(d: Date): Date {
  const p = getETParts(d);
  return etWallToUTC(p.year, p.month, 1);
}

export function addMonthsET(d: Date, n: number): Date {
  const p = getETParts(d);
  const totalMonths = (p.year * 12 + (p.month - 1)) + n;
  const year = Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return etWallToUTC(year, month, 1);
}

/** First day visible on a month grid: the Sunday on or before the 1st. */
export function startOfMonthGridET(d: Date): Date {
  return startOfWeekET(startOfMonthET(d));
}

/** Last+1 day visible on a month grid (exclusive). Always 42 days from grid start. */
export function endOfMonthGridET(d: Date): Date {
  return addDaysET(startOfMonthGridET(d), 42);
}

export function isSameETDay(a: Date, b: Date): boolean {
  const pa = getETParts(a);
  const pb = getETParts(b);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

/** Pretty time in ET, e.g., "8:30 AM". */
export function fmtTimeET(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

/** Pretty short date in ET, e.g., "May 19". */
export function fmtShortDateET(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Pretty long date in ET, e.g., "Tue, May 19, 2026". */
export function fmtLongDateET(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

/** Pretty month + year, e.g., "May 2026". */
export function fmtMonthYearET(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    month: "long",
    year: "numeric",
  }).format(d);
}

/**
 * Heuristic: a visit is "all day" if it starts at ET-midnight and either has
 * no end or ends just before the next ET-midnight.
 */
export function isAllDayVisit(start: Date, end: Date | null): boolean {
  const sp = getETParts(start);
  if (sp.hour !== 0 || sp.minute !== 0) return false;
  if (!end) return true;
  const ep = getETParts(end);
  // 23:xx of same day, or 00:00 of next day
  if (ep.hour === 23 && ep.minute >= 55) return true;
  if (ep.hour === 0 && ep.minute === 0) {
    const sUtc = start.getTime();
    const eUtc = end.getTime();
    return eUtc - sUtc >= 23 * 3600 * 1000;
  }
  return false;
}
