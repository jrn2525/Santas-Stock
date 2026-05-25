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
