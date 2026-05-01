const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const MS_PER_DAY = 86_400_000;

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";

  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const now = new Date();
  const deltaSec = Math.floor((now.getTime() - then.getTime()) / 1000);

  if (deltaSec < 60) return "now";

  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m`;

  const deltaHr = Math.floor(deltaMin / 60);
  if (deltaHr < 24) return `${deltaHr}h`;

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfThen = new Date(
    then.getFullYear(),
    then.getMonth(),
    then.getDate()
  ).getTime();
  const calendarDaysAgo = Math.round((startOfToday - startOfThen) / MS_PER_DAY);

  if (calendarDaysAgo === 1) return "yesterday";
  if (calendarDaysAgo < 7) return `${calendarDaysAgo}d`;

  return `${MONTH_ABBR[then.getMonth()]} ${then.getDate()}`;
}
