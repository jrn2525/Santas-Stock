import Link from "next/link";
import {
  addDaysET,
  formatDateParam,
  getETParts,
  isAllDayVisit,
  isSameETDay,
  startOfMonthGridET,
  todayET,
  fmtTimeET,
} from "@/lib/datetime";
import type { CalendarVisit } from "./calendar-types";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarMonthView({
  anchor,
  visits,
}: {
  anchor: Date;
  visits: CalendarVisit[];
}) {
  const gridStart = startOfMonthGridET(anchor);
  const days: Date[] = Array.from({ length: 42 }, (_, i) =>
    addDaysET(gridStart, i),
  );
  const anchorParts = getETParts(anchor);
  const today = todayET();

  // Bucket visits by ET day key.
  const buckets = new Map<string, CalendarVisit[]>();
  for (const v of visits) {
    if (!v.startAt) continue;
    const key = formatDateParam(v.startAt);
    const list = buckets.get(key) ?? [];
    list.push(v);
    buckets.set(key, list);
  }

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-rule">
      <div className="min-w-[42rem]">
      <div className="grid grid-cols-7 bg-card text-center text-xs uppercase tracking-wider text-ink-dim">
        {DAY_NAMES.map((d) => (
          <div key={d} className="px-2 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 bg-canvas">
        {days.map((d) => {
          const parts = getETParts(d);
          const inMonth = parts.month === anchorParts.month;
          const isToday = isSameETDay(d, today);
          const key = formatDateParam(d);
          const dayVisits = buckets.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-[110px] border-b border-r border-rule p-2 ${
                inMonth ? "" : "opacity-50"
              } ${isToday ? "bg-brand/10" : ""}`}
            >
              <Link
                href={`/job-flow/calendar?view=day&date=${key}`}
                className={`text-xs font-medium ${
                  isToday ? "text-brand" : "text-ink"
                } hover:text-brand`}
              >
                {parts.day}
              </Link>
              <ul className="mt-1 space-y-0.5">
                {dayVisits.slice(0, 3).map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/job-flow/jobs/${v.job.id}`}
                      className="block truncate rounded bg-brand/20 px-1 py-0.5 text-xs text-ink hover:bg-brand"
                      title={visitTooltip(v)}
                    >
                      {!isAllDayVisit(v.startAt!, v.endAt) && v.startAt && (
                        <span className="mr-1 tabular-nums opacity-80">
                          {fmtTimeET(v.startAt)}
                        </span>
                      )}
                      {v.job.client?.name ?? v.title ?? "Visit"}
                    </Link>
                  </li>
                ))}
                {dayVisits.length > 3 && (
                  <li className="text-xs text-ink-dim">
                    +{dayVisits.length - 3} more
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function visitTooltip(v: CalendarVisit): string {
  const parts: string[] = [];
  if (v.job.client?.name) parts.push(v.job.client.name);
  if (v.title) parts.push(v.title);
  else if (v.job.title) parts.push(v.job.title);
  if (v.startAt && !isAllDayVisit(v.startAt, v.endAt)) {
    parts.push(`${fmtTimeET(v.startAt)}${v.endAt ? ` – ${fmtTimeET(v.endAt)}` : ""}`);
  }
  return parts.join(" — ");
}
