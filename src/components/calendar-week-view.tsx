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

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Hourly grid spans 7 AM – 9 PM (7..21). Each hour is 56px tall.
const HOUR_START = 7;
const HOUR_END = 21;
const HOUR_HEIGHT = 56;
const HOURS = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);

export function CalendarWeekView({
  anchor,
  visits,
}: {
  anchor: Date;
  visits: CalendarVisit[];
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

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-rule bg-canvas">
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
                        title={`${v.job.client?.name ?? ""} ${v.title ?? v.job.title ?? ""}`.trim()}
                      >
                        {v.job.client?.name ?? v.title ?? "Visit"}
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
          gridTemplateRows: `repeat(${HOURS.length}, ${HOUR_HEIGHT}px)`,
        }}
      >
        {/* Hour labels column */}
        {HOURS.map((h, i) => (
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
          return HOURS.map((h, i) => (
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
          return bucket.timed.map((v) => {
            const block = visitBlock(v);
            if (!block) return null;
            return (
              <Link
                key={v.id}
                href={`/job-flow/jobs/${v.job.id}`}
                className="absolute z-10 m-0.5 overflow-hidden rounded bg-brand/80 px-1.5 py-1 text-xs text-ink hover:bg-brand"
                style={{
                  // Column starts at grid line dayIdx+2; we use absolute positioning instead.
                  left: `calc(60px + ${dayIdx} * ((100% - 60px) / 7))`,
                  width: `calc((100% - 60px) / 7)`,
                  top: `${block.top}px`,
                  height: `${block.height}px`,
                }}
                title={`${v.job.client?.name ?? ""}${v.startAt ? " · " + fmtTimeET(v.startAt) : ""}${v.endAt ? " – " + fmtTimeET(v.endAt) : ""}`}
              >
                <div className="truncate font-medium">
                  {v.job.client?.name ?? v.title ?? "Visit"}
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
  );
}

function fmtHourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function visitBlock(v: CalendarVisit): { top: number; height: number } | null {
  if (!v.startAt) return null;
  const sp = getETParts(v.startAt);
  let startHour = sp.hour + sp.minute / 60;
  let endHour: number;
  if (v.endAt) {
    const ep = getETParts(v.endAt);
    endHour = ep.hour + ep.minute / 60;
    // Visits crossing midnight get clamped to end of day for layout.
    if (endHour <= startHour) endHour = HOUR_END;
  } else {
    endHour = startHour + 1;
  }
  // Clamp to visible range
  if (endHour <= HOUR_START || startHour >= HOUR_END) return null;
  startHour = Math.max(startHour, HOUR_START);
  endHour = Math.min(endHour, HOUR_END);
  const top = (startHour - HOUR_START) * HOUR_HEIGHT;
  const height = Math.max(20, (endHour - startHour) * HOUR_HEIGHT);
  return { top, height };
}
