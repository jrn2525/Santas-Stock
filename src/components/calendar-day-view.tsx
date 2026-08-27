import Link from "next/link";
import {
  fmtTimeET,
  formatDateParam,
  getETParts,
  isAllDayVisit,
  isSameETDay,
  todayET,
} from "@/lib/datetime";
import type { CalendarVisit } from "./calendar-types";
import { computeHourRange, computeVisitColumns } from "./calendar-types";
import { customerLabelOrEmpty, customerLabel } from "@/lib/customer-name";

const HOUR_HEIGHT = 64;

export function CalendarDayView({
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
  const dayKey = formatDateParam(anchor);
  const isToday = isSameETDay(anchor, todayET());
  const dayVisits = visits.filter(
    (v) => v.startAt && formatDateParam(v.startAt) === dayKey,
  );
  const allDay = dayVisits.filter((v) => v.startAt && isAllDayVisit(v.startAt, v.endAt));
  const timed = dayVisits.filter((v) => v.startAt && !isAllDayVisit(v.startAt, v.endAt));
  const { start: hourStart, end: hourEnd } = computeHourRange(
    timed,
    defaultStart,
    defaultEnd,
  );
  const hours = Array.from(
    { length: hourEnd - hourStart },
    (_, i) => hourStart + i,
  );
  const cols = computeVisitColumns(timed, hourStart, hourEnd);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-rule bg-canvas">
      {allDay.length > 0 && (
        <div className="border-b border-rule bg-canvas p-2">
          <div className="text-xs uppercase tracking-wider text-ink-dim">
            All day
          </div>
          <ul className="mt-1 space-y-1">
            {allDay.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/job-flow/jobs/${v.job.id}`}
                  className="block rounded bg-brand/20 px-2 py-1 text-sm text-ink hover:bg-brand"
                >
                  <span className="font-medium">
                    {customerLabelOrEmpty(v.job.client) || v.title || "Visit"}
                  </span>
                  {v.title && customerLabelOrEmpty(v.job.client) && (
                    <span className="ml-2 text-ink-dim">{v.title}</span>
                  )}
                  {v.job.jobNumber && (
                    <span className="ml-2 text-xs text-ink-dim">
                      Job #{v.job.jobNumber}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div
        className={`relative ${isToday ? "bg-brand/5" : ""}`}
        style={{ height: `${hours.length * HOUR_HEIGHT}px` }}
      >
        {hours.map((h) => (
          <div
            key={`row-${h}`}
            className="flex border-t border-rule"
            style={{ height: `${HOUR_HEIGHT}px` }}
          >
            <div className="-mt-2 w-16 shrink-0 px-2 text-right text-xs text-ink-dim">
              {fmtHourLabel(h)}
            </div>
            <div className="flex-1" />
          </div>
        ))}

        {timed.map((v) => {
          const block = visitBlock(v, hourStart, hourEnd);
          if (!block) return null;
          const { col, cols: n } = cols.get(v.id) ?? { col: 0, cols: 1 };
          return (
            <Link
              key={v.id}
              href={`/job-flow/jobs/${v.job.id}`}
              className="absolute z-10 overflow-hidden rounded bg-brand/80 px-3 py-2 text-sm text-ink hover:bg-brand"
              style={{
                left: `calc(70px + ${col} * ((100% - 78px) / ${n}))`,
                width: `calc((100% - 78px) / ${n} - 2px)`,
                top: `${block.top}px`,
                height: `${block.height}px`,
              }}
            >
              <div className="font-medium">
                {customerLabelOrEmpty(v.job.client) || v.title || "Visit"}
              </div>
              {v.startAt && (
                <div className="text-xs opacity-90">
                  {fmtTimeET(v.startAt)}
                  {v.endAt && ` – ${fmtTimeET(v.endAt)}`}
                </div>
              )}
              {(v.title || v.job.title) && customerLabelOrEmpty(v.job.client) && (
                <div className="text-xs opacity-80 truncate">
                  {v.title ?? v.job.title}
                </div>
              )}
              <div className="text-xs opacity-80">
                {v.job.jobNumber && <>Job #{v.job.jobNumber}</>}
                {v.job.property?.address && <> · {v.job.property.address}</>}
              </div>
            </Link>
          );
        })}

        {timed.length === 0 && allDay.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-ink-dim">No visits scheduled.</p>
          </div>
        )}
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
    if (endHour <= startHour) endHour = hourEnd;
  } else {
    endHour = startHour + 1;
  }
  if (endHour <= hourStart || startHour >= hourEnd) return null;
  startHour = Math.max(startHour, hourStart);
  endHour = Math.min(endHour, hourEnd);
  const top = (startHour - hourStart) * HOUR_HEIGHT;
  const height = Math.max(28, (endHour - startHour) * HOUR_HEIGHT);
  return { top, height };
}
