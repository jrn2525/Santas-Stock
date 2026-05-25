import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { getSettings } from "@/lib/settings";
import {
  addDaysET,
  endOfMonthGridET,
  endOfWeekET,
  fmtLongDateET,
  fmtMonthYearET,
  fmtShortDateET,
  parseDateParam,
  startOfDayET,
  startOfMonthGridET,
  startOfNextDayET,
  startOfWeekET,
} from "@/lib/datetime";
import {
  CalendarToolbar,
  type CalendarView,
} from "@/components/calendar-toolbar";
import { CalendarMonthView } from "@/components/calendar-month-view";
import { CalendarWeekView } from "@/components/calendar-week-view";
import { CalendarDayView } from "@/components/calendar-day-view";

export const dynamic = "force-dynamic";

function parseView(
  s: string | undefined,
  fallback: CalendarView,
): CalendarView {
  if (s === "month" || s === "day" || s === "week") return s;
  return fallback;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requireUser();
  const settings = await getSettings();
  const { view: viewParam, date: dateParam } = await searchParams;
  const view = parseView(viewParam, settings.calendarDefaultView);
  const anchor = parseDateParam(dateParam);

  let rangeStart: Date;
  let rangeEnd: Date; // exclusive
  let periodLabel: string;
  if (view === "month") {
    rangeStart = startOfMonthGridET(anchor);
    rangeEnd = endOfMonthGridET(anchor);
    periodLabel = fmtMonthYearET(anchor);
  } else if (view === "day") {
    rangeStart = startOfDayET(anchor);
    rangeEnd = startOfNextDayET(anchor);
    periodLabel = fmtLongDateET(anchor);
  } else {
    rangeStart = startOfWeekET(anchor);
    rangeEnd = endOfWeekET(anchor);
    const last = addDaysET(rangeStart, 6);
    periodLabel = `${fmtShortDateET(rangeStart)} – ${fmtShortDateET(last)}`;
  }

  const visits = await prisma.jobberVisit.findMany({
    where: { startAt: { gte: rangeStart, lt: rangeEnd } },
    orderBy: [{ startAt: "asc" }],
    include: {
      job: {
        select: {
          id: true,
          title: true,
          jobNumber: true,
          client: { select: { name: true } },
          property: { select: { address: true } },
        },
      },
    },
    take: 1000,
  });

  return (
    <>
      <header className="no-print">
        <h1 className="text-3xl font-bold text-brand-hover">Calendar</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Visits synced from Jobber. Times shown in Eastern Time.
        </p>
      </header>

      <CalendarToolbar view={view} anchor={anchor} periodLabel={periodLabel} />

      <div className="print-block">
        <h2 className="hidden print:block text-2xl font-bold mb-2">
          {periodLabel}
        </h2>
        {view === "month" && (
          <CalendarMonthView anchor={anchor} visits={visits} />
        )}
        {view === "week" && (
          <CalendarWeekView
            anchor={anchor}
            visits={visits}
            hourStart={settings.calendarHourStart}
            hourEnd={settings.calendarHourEnd}
          />
        )}
        {view === "day" && (
          <CalendarDayView
            anchor={anchor}
            visits={visits}
            hourStart={settings.calendarHourStart}
            hourEnd={settings.calendarHourEnd}
          />
        )}
      </div>
    </>
  );
}
