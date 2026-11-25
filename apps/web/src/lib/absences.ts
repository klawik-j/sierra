import type { AbsenceKind } from "@sierra/shared";

/** A run of leave days of one kind for one person, e.g. vacation 21 Dec – 2 Jan. */
export interface AbsencePeriod {
  userId: string;
  kind: AbsenceKind;
  from: string;
  to: string;
  /** Days actually marked as leave (weekends in between usually are not). */
  days: number;
}

const DAY = 864e5;
const at = (day: string) => Date.parse(`${day}T00:00:00Z`);
const isWeekend = (time: number) => [0, 6].includes(new Date(time).getUTCDay());

/** True when every day strictly between the two is a Saturday or Sunday (or there is none). */
function onlyWeekendBetween(a: string, b: string) {
  for (let t = at(a) + DAY; t < at(b); t += DAY) if (!isWeekend(t)) return false;
  return true;
}

/** Groups per-day leave rows into periods; a weekend inside a period does not split it. */
export function toPeriods(rows: { userId: string; date: string; kind: string }[]): AbsencePeriod[] {
  const sorted = rows.filter((r) => r.kind !== "work").sort((a, b) => a.userId.localeCompare(b.userId) || a.kind.localeCompare(b.kind) || a.date.localeCompare(b.date));
  const out: AbsencePeriod[] = [];
  for (const row of sorted) {
    const last = out[out.length - 1];
    if (last && last.userId === row.userId && last.kind === row.kind && onlyWeekendBetween(last.to, row.date)) {
      last.to = row.date;
      last.days++;
    } else {
      out.push({ userId: row.userId, kind: row.kind as AbsenceKind, from: row.date, to: row.date, days: 1 });
    }
  }
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

/** Number of days a from–to range will mark, with or without weekends. */
export function countDays(from: string, to: string, weekdaysOnly: boolean) {
  let n = 0;
  for (let t = at(from); t <= at(to); t += DAY) if (!weekdaysOnly || !isWeekend(t)) n++;
  return n;
}

export const shiftDay = (day: string, by: number) => new Date(at(day) + by * DAY).toISOString().slice(0, 10);
