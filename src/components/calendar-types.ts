import { getETParts, isAllDayVisit } from "@/lib/datetime";

export type CalendarVisit = {
  id: string;
  title: string | null;
  startAt: Date | null;
  endAt: Date | null;
  status: string;
  job: {
    id: string;
    title: string | null;
    jobNumber: string | null;
    client: { name: string } | null;
    property: { address: string } | null;
  };
};

// The grid defaults to 7 AM – 9 PM and expands to fit any visit outside it.
export const DEFAULT_HOUR_START = 7;
export const DEFAULT_HOUR_END = 21;

/**
 * The hour window [start, end) the day/week grid should render: the default
 * 7 AM – 9 PM, widened to include any timed visit that starts earlier or
 * ends later, so a visit outside the default range is shown in full instead
 * of being clamped to (or hidden at) the edge. Returns whole hours in
 * [0, 24]. All-day and start-less visits are ignored.
 */
export function computeHourRange(visits: CalendarVisit[]): {
  start: number;
  end: number;
} {
  let start = DEFAULT_HOUR_START;
  let end = DEFAULT_HOUR_END;

  for (const v of visits) {
    if (!v.startAt) continue;
    if (isAllDayVisit(v.startAt, v.endAt)) continue;

    const sp = getETParts(v.startAt);
    const startHour = sp.hour + sp.minute / 60;
    start = Math.min(start, Math.floor(startHour));

    let endHour: number;
    if (v.endAt) {
      const ep = getETParts(v.endAt);
      endHour = ep.hour + ep.minute / 60;
      if (endHour <= startHour) endHour = 24; // crosses midnight
    } else {
      endHour = startHour + 1;
    }
    end = Math.max(end, Math.ceil(endHour));
  }

  return { start: Math.max(0, start), end: Math.min(24, end) };
}

function visitInterval(
  v: CalendarVisit,
  hourStart: number,
  hourEnd: number,
): { id: string; start: number; end: number } | null {
  if (!v.startAt || isAllDayVisit(v.startAt, v.endAt)) return null;
  const sp = getETParts(v.startAt);
  const start = sp.hour + sp.minute / 60;
  let end: number;
  if (v.endAt) {
    const ep = getETParts(v.endAt);
    end = ep.hour + ep.minute / 60;
    if (end <= start) end = hourEnd; // crosses midnight
  } else {
    end = start + 1;
  }
  if (end <= hourStart || start >= hourEnd) return null;
  return {
    id: v.id,
    start: Math.max(start, hourStart),
    end: Math.min(end, hourEnd),
  };
}

/**
 * Lay overlapping visits out side-by-side. Visits whose times overlap
 * (transitively) form a cluster; within a cluster each visit is greedily
 * assigned the first free column, and every visit in the cluster shares the
 * cluster's total column count so they line up. Returns `col` (0-based) and
 * `cols` (columns in that visit's cluster) keyed by visit id. Visits outside
 * the grid range get no entry (they aren't rendered).
 */
export function computeVisitColumns(
  visits: CalendarVisit[],
  hourStart: number,
  hourEnd: number,
): Map<string, { col: number; cols: number }> {
  const intervals = visits
    .map((v) => visitInterval(v, hourStart, hourEnd))
    .filter((x): x is { id: string; start: number; end: number } => x !== null)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const result = new Map<string, { col: number; cols: number }>();
  let i = 0;
  while (i < intervals.length) {
    // Gather a cluster of transitively-overlapping intervals.
    const cluster = [intervals[i]];
    let clusterEnd = intervals[i].end;
    let j = i + 1;
    while (j < intervals.length && intervals[j].start < clusterEnd) {
      cluster.push(intervals[j]);
      clusterEnd = Math.max(clusterEnd, intervals[j].end);
      j++;
    }
    // Greedy column assignment: reuse the first column whose last visit
    // has already ended.
    const colEnds: number[] = [];
    for (const iv of cluster) {
      let placed = colEnds.findIndex((end) => end <= iv.start);
      if (placed === -1) {
        placed = colEnds.length;
        colEnds.push(iv.end);
      } else {
        colEnds[placed] = iv.end;
      }
      result.set(iv.id, { col: placed, cols: 1 });
    }
    const cols = colEnds.length;
    for (const iv of cluster) result.get(iv.id)!.cols = cols;
    i = j;
  }
  return result;
}
