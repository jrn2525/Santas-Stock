import Link from "next/link";
import {
  addDaysET,
  fmtTimeET,
  formatDateParam,
  getETParts,
  isAllDayVisit,
  isSameETDay,
  startOfWeekET,
  todayET,
} from "@/lib/datetime";
import type { CalendarVisit } from "./calendar-types";
import { computeHourRange, computeVisitColumns } from "./calendar-types";
import { customerLabelOrEmpty, customerLabel } from "@/lib/customer-name";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Grid defaults to 7 AM – 9 PM, expanding to fit out-of-range visits. Each
// hour is 56px tall.
const HOUR_HEIGHT = 56;

export function CalendarWeekView({
  anchor,
  visits,
  hourStart: defaultStart,
  hourEnd: defaultEnd,
}: {
  anchor: Date;
  visits: CalendarVisit[];
  hourStart?: number;
  hourEnd?: number;
}) {
  const weekStart = startOfWeekET(anchor);
  const days: Date[] = Array.from({ length: 7 }, (_, i) => addDaysET(weekStart, i));
  const today = todayET();

  // Bucket visits per day; separate all-day from timed for layout.
  type Bucketed = { allDay: CalendarVisit[]; timed: CalendarVisit[] };
  const byDay = new Map<string, Bucketed>();
  for (const d of days) byDay.set(formatDateParam(d), { allDay: [], timed: [] });
  for (const v of visits) {
    if (!v.startAt) continue;
    const key = formatDateParam(v.startAt);
    const bucket = byDay.get(key);
    if (!bucket) continue;
    if (isAllDayVisit(v.startAt, v.endAt)) bucket.allDay.push(v);
    else bucket.timed.push(v);
  }

  // Fit the hour grid to this week's timed visits (defaults to 7 AM–9 PM).
  const weekTimed = days.flatMap((d) => byDay.get(formatDateParam(d))!.timed);
  const { start: hourStart, end: hourEnd } = computeHourRange(
    weekTimed,
    defaultStart,
    defaultEnd,
  );
  const hours = Array.from(
    { length: hourEnd - hourStart },
    (_, i) => hourStart + i,
  );

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-rule bg-canvas">
      <div className="min-w-[48rem]">
      {/* Header row: day names + dates */}
      <div className="grid border-b border-rule" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
        <div className="bg-card" />
        {days.map((d) => {
          const parts = getETParts(d);
          const isToday = isSameETDay(d, today);
          return (
            <Link
              key={formatDateParam(d)}
              href={`/job-flow/calendar?view=day&date=${formatDateParam(d)}`}
              className={`border-l border-rule px-2 py-2 text-center text-sm hover:bg-card/40 ${
                isToday ? "bg-brand/10" : "bg-card"
              }`}
            >
              <div className={`text-xs uppercase tracking-wider ${isToday ? "text-brand" : "text-ink-dim"}`}>
                {DAY_NAMES[parts.weekday]}
              </div>
              <div className={`text-base font-semibold ${isToday ? "text-brand" : "text-ink"}`}>
                {parts.day}
              </div>
            </Link>
          );
        })}
      </div>

      {/* All-day row (only if any all-day visits exist) */}
      {days.some((d) => (byDay.get(formatDateParam(d))!.allDay.length > 0)) && (
        <div className="grid border-b border-rule bg-canvas" style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}>
          <div className="px-1 py-2 text-right text-xs uppercase tracking-wider text-ink-dim">
            All day
          </div>
          {days.map((d) => {
            const bucket = byDay.get(formatDateParam(d))!;
            return (
              <div key={formatDateParam(d)} className="border-l border-rule p-1">
                <ul className="space-y-0.5">
                  {bucket.allDay.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={`/job-flow/jobs/${v.job.id}`}
                        className="block truncate rounded bg-brand/20 px-1.5 py-0.5 text-xs text-ink hover:bg-brand"
                        title={`${customerLabelOrEmpty(v.job.client)} ${v.title ?? v.job.title ?? ""}`.trim()}
                      >
                        {customerLabelOrEmpty(v.job.client) || v.title || "Visit"}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {/* Hour grid */}
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: "60px repeat(7, 1fr)",
          gridTemplateRows: `repeat(${hours.length}, ${HOUR_HEIGHT}px)`,
        }}
      >
        {/* Hour labels column */}
        {hours.map((h, i) => (
          <div
            key={`label-${h}`}
            className="-mt-2 border-t border-rule px-1 text-right text-xs text-ink-dim"
            style={{ gridColumn: 1, gridRow: i + 1 }}
          >
            {fmtHourLabel(h)}
          </div>
        ))}

        {/* Day cells with hour grid lines */}
        {days.map((d, dayIdx) => {
          const isToday = isSameETDay(d, today);
          return hours.map((h, i) => (
            <div
              key={`cell-${dayIdx}-${h}`}
              className={`border-l border-t border-rule ${isToday ? "bg-brand/5" : ""}`}
              style={{ gridColumn: dayIdx + 2, gridRow: i + 1 }}
            />
          ));
        })}

        {/* Timed visit blocks */}
        {days.map((d, dayIdx) => {
          const bucket = byDay.get(formatDateParam(d))!;
          const dayCols = computeVisitColumns(bucket.timed, hourStart, hourEnd);
          return bucket.timed.map((v) => {
            const block = visitBlock(v, hourStart, hourEnd);
            if (!block) return null;
            const { col, cols: n } = dayCols.get(v.id) ?? { col: 0, cols: 1 };
            return (
              <Link
                key={v.id}
                href={`/job-flow/jobs/${v.job.id}`}
                className="absolute z-10 overflow-hidden rounded bg-brand/80 px-1.5 py-1 text-xs text-ink hover:bg-brand"
                style={{
                  // Day column starts at grid line dayIdx+2; overlapping
                  // visits split that column into n side-by-side columns.
                  left: `calc(60px + ${dayIdx} * ((100% - 60px) / 7) + ${col} * (((100% - 60px) / 7) / ${n}))`,
                  width: `calc(((100% - 60px) / 7) / ${n} - 2px)`,
                  top: `${block.top}px`,
                  height: `${block.height}px`,
                }}
                title={`${customerLabelOrEmpty(v.job.client)}${v.startAt ? " · " + fmtTimeET(v.startAt) : ""}${v.endAt ? " – " + fmtTimeET(v.endAt) : ""}`}
              >
                <div className="truncate font-medium">
                  {customerLabelOrEmpty(v.job.client) || v.title || "Visit"}
                </div>
                {v.startAt && (
                  <div className="truncate opacity-90">
                    {fmtTimeET(v.startAt)}
                    {v.endAt && ` – ${fmtTimeET(v.endAt)}`}
                  </div>
                )}
                {v.job.jobNumber && (
                  <div className="truncate text-[10px] opacity-80">
                    Job #{v.job.jobNumber}
                  </div>
                )}
              </Link>
            );
          });
        })}
      </div>
      </div>
    </div>
  );
}

function fmtHourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function visitBlock(
  v: CalendarVisit,
  hourStart: number,
  hourEnd: number,
): { top: number; height: number } | null {
  if (!v.startAt) return null;
  const sp = getETParts(v.startAt);
  let startHour = sp.hour + sp.minute / 60;
  let endHour: number;
  if (v.endAt) {
    const ep = getETParts(v.endAt);
    endHour = ep.hour + ep.minute / 60;
    // Visits crossing midnight get clamped to end of day for layout.
    if (endHour <= startHour) endHour = hourEnd;
  } else {
    endHour = startHour + 1;
  }
  // Clamp to visible range
  if (endHour <= hourStart || startHour >= hourEnd) return null;
  startHour = Math.max(startHour, hourStart);
  endHour = Math.min(endHour, hourEnd);
  const top = (startHour - hourStart) * HOUR_HEIGHT;
  const height = Math.max(20, (endHour - startHour) * HOUR_HEIGHT);
  return { top, height };
}
