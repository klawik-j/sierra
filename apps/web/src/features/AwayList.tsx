import { useMemo } from "react";
import { AbsenceBadge } from "../components/domain";
import { Avatar, cx } from "../components/ui";
import { shiftDay, toPeriods, type AbsencePeriod } from "../lib/absences";
import { todayStr, useFmt } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useWorkTime } from "../lib/queries";
import { useForms } from "./forms";

/** Leave periods that are running now or start within `daysAhead` days — as far as the viewer may know about them. */
export function useAway(daysAhead: number): AbsencePeriod[] | undefined {
  const today = todayStr();
  const horizon = shiftDay(today, daysAhead);
  // Load wider than the horizon on both sides so a period is shown with its real first and last day.
  const query = useWorkTime(shiftDay(today, -31), shiftDay(today, daysAhead + 62));
  return useMemo(() => (query.data ? toPeriods(query.data.absences).filter((p) => p.to >= today && p.from <= horizon) : undefined), [query.data, today, horizon]);
}

/** "Who is away": everyone's vacation; sick leave only where the viewer is allowed to see it. */
export function AwayList({ periods }: { periods: AbsencePeriod[] }) {
  const t = useT();
  const fmt = useFmt();
  const { member, user, can } = useOrg();
  const forms = useForms();
  const today = todayStr();
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
      {periods.map((p) => {
        const person = member(p.userId);
        const mayOpen = p.userId === user.id || can("worktime.manage");
        const now = p.from <= today;
        const body = (
          <>
            <Avatar name={person?.name ?? "?"} size={36} className="ring-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.9375rem] font-bold">{p.userId === user.id ? t("common.you") : (person?.name ?? "—")}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                <AbsenceBadge kind={p.kind} />
                <span className="font-semibold text-fg">{fmt.range(p.from, p.to)}</span>
                <span>{t("absence.days", { n: p.days })}</span>
              </span>
            </span>
            <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", now ? "bg-primary-soft text-primary-ink" : "bg-surface-3 text-muted")}>{now ? t("absence.now") : fmt.due(p.from)}</span>
          </>
        );
        return (
          <li key={`${p.userId}:${p.kind}:${p.from}`}>
            {mayOpen ? (
              <button type="button" onClick={() => forms.open({ kind: "workday", userId: p.userId, date: p.from })} className="flex min-h-16 w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2 sm:px-4">
                {body}
              </button>
            ) : (
              <div className="flex min-h-16 items-center gap-3 px-3.5 py-2.5 sm:px-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
