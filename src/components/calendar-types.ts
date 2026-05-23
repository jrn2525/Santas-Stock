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
