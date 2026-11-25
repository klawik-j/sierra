import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { enGB, pl as plLocale } from "date-fns/locale";
import { useMemo } from "react";
import { useLocale, type TFn } from "./i18n";

export const todayStr = (offsetDays = 0) => format(new Date(Date.now() + offsetDays * 864e5), "yyyy-MM-dd");

export type DueState = "overdue" | "today" | "soon" | "later";

/** How urgent a calendar day is relative to today. */
export function dueState(day: string, soonDays = 2): { state: DueState; days: number } {
  const days = differenceInCalendarDays(parseISO(day), new Date());
  return { state: days < 0 ? "overdue" : days === 0 ? "today" : days <= soonDays ? "soon" : "later", days };
}

/** "8", "7,5", "7.5", "7:30" or "8h" -> minutes; null when it is not a duration. */
export function parseHours(text: string): number | null {
  const value = text.trim().toLowerCase().replace(/\s*h$/, "");
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const n = Number(value.replace(",", "."));
  return value && Number.isFinite(n) && n >= 0 ? Math.round(n * 60) : null;
}

export const dayStr = (date: Date) => format(date, "yyyy-MM-dd");

export const minutesToHours = (minutes: number | null) => (minutes === null ? "" : String(Math.round((minutes / 60) * 100) / 100));

function minutesText(t: TFn, minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t("time.min", { n: m });
  return m ? `${t("time.h", { n: h })} ${t("time.min", { n: m })}` : t("time.h", { n: h });
}

export function useFmt() {
  const { locale, t } = useLocale();
  return useMemo(() => {
    const loc = locale === "pl" ? plLocale : enGB;
    const sameYear = (d: Date) => d.getFullYear() === new Date().getFullYear();
    return {
      /** "12 lis" / "12 lis 2025" from a `YYYY-MM-DD` day or ISO timestamp. */
      day(value: string) {
        const d = parseISO(value);
        return format(d, sameYear(d) ? "d MMM" : "d MMM yyyy", { locale: loc });
      },
      dateTime(iso: string) {
        const d = parseISO(iso);
        return format(d, sameYear(d) ? "d MMM, HH:mm" : "d MMM yyyy, HH:mm", { locale: loc });
      },
      ago(iso: string) {
        const d = parseISO(iso);
        if (Date.now() - d.getTime() < 60_000) return t("time.justNow");
        return formatDistanceToNowStrict(d, { locale: loc, addSuffix: true });
      },
      minutes: (minutes: number) => minutesText(t, minutes),
      /** "Po terminie 3 dni" / "Dziś" / "Jutro" / "12 lis". */
      due(day: string) {
        const { state, days } = dueState(day);
        if (state === "overdue") return t("due.overdue", { n: -days });
        if (state === "today") return t("due.today");
        if (days === 1) return t("due.tomorrow");
        return this.day(day);
      },
      /** "25 lis", "21–31 gru" or "21 gru – 2 sty". */
      range(from: string, to: string) {
        if (from === to) return this.day(from);
        const a = parseISO(from);
        const b = parseISO(to);
        return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${a.getDate()}–${this.day(to)}` : `${this.day(from)} – ${this.day(to)}`;
      },
      number: (n: number) => new Intl.NumberFormat(locale).format(n),
      /** Minutes as decimal hours for tables and inputs: "7,5" / "7.5". */
      hours: (minutes: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(minutes / 60),
      /** date-fns pattern in the user's language, e.g. `pattern(date, "EEEE, d MMMM")`. */
      pattern: (date: Date, pattern: string) => format(date, pattern, { locale: loc }),
    };
  }, [locale, t]);
}
