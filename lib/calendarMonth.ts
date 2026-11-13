/**
 * lib/calendarMonth.ts
 *
 * The month grid behind Home's full calendar (components/CalendarSheet.tsx): weeks start on Sunday, every week has 7 cells,
 * and a day is marked when at least one saved workout landed on it (local time).
 */
export interface CalCell { day: number | null; key: string | null; trained: boolean; today: boolean }

export const dayKey = (d: Date): string => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();

/** The set of local days that have a saved workout. */
export function trainedDays(timestamps: number[]): Set<string> {
  const s = new Set<string>();
  for (const t of timestamps) { if (Number.isFinite(t)) s.add(dayKey(new Date(t))); }
  return s;
}

/** Weeks (rows of 7) for a month. year is the full year, month is 0-11. */
export function monthGrid(year: number, month: number, trained: Set<string>, now: Date = new Date()): CalCell[][] {
  const first = new Date(year, month, 1);
  const count = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(now);
  const cells: CalCell[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push({ day: null, key: null, trained: false, today: false });
  for (let d = 1; d <= count; d++) {
    const key = year + '-' + (month + 1) + '-' + d;
    cells.push({ day: d, key, trained: trained.has(key), today: key === todayKey });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null, key: null, trained: false, today: false });
  const weeks: CalCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
