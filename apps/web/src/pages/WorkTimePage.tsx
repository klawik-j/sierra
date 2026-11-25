import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, isWeekend, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { ArrowLeft, ChevronLeft, ChevronRight, ClipboardList, Clock, Download, Lock, Pencil, Plus, TreePalm } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { canEditWorkDay, type MemberDto, type WorkDayDto, type WorkTicketTimeDto, type WorkTimeDto } from "@sierra/shared";
import { AbsenceBadge, absenceMeta, RoleBadge } from "../components/domain";
import { Avatar, Button, Card, cx, EmptyState, IconButton, PageHeader, PageLoader, Section, Segmented } from "../components/ui";
import { AwayList, useAway } from "../features/AwayList";
import { TicketLink, useForms } from "../features/forms";
import { shiftDay } from "../lib/absences";
import { dayStr, todayStr, useFmt } from "../lib/format";
import { useLocale, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useWorkTime } from "../lib/queries";

type Period = "day" | "week" | "month";
type Tab = "team" | "mine";

const weekOptions = { weekStartsOn: 1 } as const;

function rangeOf(period: Period, anchor: Date) {
  if (period === "day") return { from: anchor, to: anchor };
  if (period === "week") return { from: startOfWeek(anchor, weekOptions), to: endOfWeek(anchor, weekOptions) };
  return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
}

const shift = (period: Period, anchor: Date, by: number) => (period === "day" ? addDays(anchor, by) : period === "week" ? addWeeks(anchor, by) : addMonths(anchor, by));

/** Lookup helpers over one response. */
function useIndex(data: WorkTimeDto | undefined) {
  return useMemo(() => {
    const days = new Map<string, WorkDayDto>();
    const tickets = new Map<string, WorkTicketTimeDto[]>();
    for (const d of data?.days ?? []) days.set(`${d.userId}|${d.date}`, d);
    for (const x of data?.ticketTime ?? []) {
      const key = `${x.userId}|${x.date}`;
      tickets.set(key, [...(tickets.get(key) ?? []), x]);
    }
    return {
      day: (userId: string, date: string) => days.get(`${userId}|${date}`),
      tickets: (userId: string, date: string) => tickets.get(`${userId}|${date}`) ?? [],
    };
  }, [data]);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function WorkTimePage() {
  const t = useT();
  const fmt = useFmt();
  const { can, user, member } = useOrg();
  const forms = useForms();
  const [params, setParams] = useSearchParams();
  const manage = can("worktime.manage");

  const tab: Tab = manage && params.get("tab") !== "mine" ? "team" : "mine";
  const drill = manage && tab === "team" ? params.get("user") : null;
  const personId = tab === "mine" ? user.id : drill;
  // One person is always shown month by month; the team can be viewed by day, week or month.
  const period: Period = personId ? "month" : ((params.get("period") as Period | null) ?? "week");
  const anchor = parseISO(params.get("date") ?? todayStr());
  const { from, to } = rangeOf(period, anchor);
  const today = todayStr();

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };
  const go = (date: Date) => set({ date: dayStr(date) === today ? null : dayStr(date) });

  const label =
    period === "day"
      ? fmt.pattern(anchor, "EEEE, d MMMM yyyy")
      : period === "month"
        ? fmt.pattern(anchor, "LLLL yyyy")
        : `${fmt.pattern(from, from.getMonth() === to.getMonth() ? "d" : "d MMM")} – ${fmt.pattern(to, "d MMM yyyy")}`;
  const isCurrent = dayStr(from) <= today && today <= dayStr(to);
  const person = member(personId);

  return (
    <>
      <PageHeader
        title={t("nav.worktime")}
        subtitle={t(manage ? "worktime.subtitleManager" : "worktime.subtitle")}
        actions={
          <>
            <Button icon={<TreePalm size={18} aria-hidden />} onClick={() => forms.open({ kind: "workday", userId: personId ?? undefined, dayKind: "vacation" })}>
              {t("absence.report")}
            </Button>
            <Button variant="primary" icon={<Plus size={19} strokeWidth={2.5} aria-hidden />} onClick={() => forms.open({ kind: "workday", userId: personId ?? undefined })}>
              {t("worktime.log")}
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-2.5">
        {manage && !drill && (
          <Segmented<Tab>
            label={t("worktime.view")}
            value={tab}
            onChange={(v) => set({ tab: v === "team" ? null : v, user: null })}
            options={[
              { value: "team", label: t("worktime.tab.team") },
              { value: "mine", label: t("worktime.tab.mine") },
            ]}
            className="justify-self-start"
          />
        )}
        {drill && (
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" icon={<ArrowLeft size={17} aria-hidden />} onClick={() => set({ user: null })}>
              {t("worktime.tab.team")}
            </Button>
            {person && (
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar name={person.name} size={32} className="ring-0" />
                <span className="truncate text-base font-bold">{person.name}</span>
                <RoleBadge role={person.role} />
              </span>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {!personId && (
            <Segmented<Period>
              label={t("worktime.period")}
              value={period}
              onChange={(v) => set({ period: v === "week" ? null : v })}
              options={[
                { value: "day", label: t("worktime.period.day") },
                { value: "week", label: t("worktime.period.week") },
                { value: "month", label: t("worktime.period.month") },
              ]}
            />
          )}
          <div className="flex items-center gap-1">
            <IconButton label={t("worktime.prev")} className="border border-line bg-surface shadow-raise" onClick={() => go(shift(period, anchor, -1))}>
              <ChevronLeft size={20} aria-hidden />
            </IconButton>
            <IconButton label={t("worktime.next")} className="border border-line bg-surface shadow-raise" disabled={dayStr(from) > shiftDay(today, 365)} onClick={() => go(shift(period, anchor, 1))}>
              <ChevronRight size={20} aria-hidden />
            </IconButton>
          </div>
          <p className="min-w-0 flex-1 truncate px-1 text-base font-bold first-letter:uppercase" aria-live="polite">
            {label}
          </p>
          {!isCurrent && (
            <Button size="sm" onClick={() => set({ date: null })}>
              {t("due.today")}
            </Button>
          )}
        </div>
      </div>

      {personId ? <PersonMonth userId={personId} from={from} to={to} /> : <Team period={period} from={from} to={to} label={label} onPerson={(id) => set({ user: id, period: null })} />}
      <Away />
    </>
  );
}

/** Upcoming leave across the team — the part of this screen everyone sees. */
function Away() {
  const t = useT();
  const periods = useAway(90);
  if (!periods) return null;
  return (
    <Section title={t("absence.team")} count={periods.length || undefined} className="mt-8 max-w-3xl">
      {periods.length ? <AwayList periods={periods} /> : <Card className="px-4 py-4 text-sm text-muted">{t("absence.teamNone")}</Card>}
      <p className="mt-2 text-sm text-muted">{t("absence.teamHint")}</p>
    </Section>
  );
}

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-3.5">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-extrabold leading-none tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function TicketChips({ items }: { items: WorkTicketTimeDto[] }) {
  const fmt = useFmt();
  if (!items.length) return null;
  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((x) => (
        <TicketLink
          key={x.ticketId}
          ticketId={x.ticketId}
          onClick={(e) => e.stopPropagation()}
          title={x.ticketTitle}
          className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full bg-info-soft px-2.5 text-xs font-semibold text-info hover:brightness-95"
        >
          <ClipboardList size={12} className="shrink-0" aria-hidden />
          <span className="truncate">
            {x.ticketKey} · {x.ticketTitle}
          </span>
          <span className="shrink-0 tabular-nums">{fmt.minutes(x.minutes)}</span>
        </TicketLink>
      ))}
    </span>
  );
}

// ---- One person, one month ---------------------------------------------------

function PersonMonth({ userId, from, to }: { userId: string; from: Date; to: Date }) {
  const t = useT();
  const fmt = useFmt();
  const { actor, member } = useOrg();
  const forms = useForms();
  const today = todayStr();
  const query = useWorkTime(dayStr(from), dayStr(to), userId);
  const index = useIndex(query.data);
  // Leave is counted per calendar year (vacation entitlement).
  const yearNo = from.getFullYear();
  const year = useWorkTime(`${yearNo}-01-01`, `${yearNo}-12-31`, userId);
  if (query.isPending) return <PageLoader />;

  const mine = (query.data?.days ?? []).filter((d) => d.userId === userId);
  const worked = mine.filter((d) => d.kind === "work");
  const total = sum(worked.map((d) => d.minutes));
  const onTickets = sum((query.data?.ticketTime ?? []).filter((x) => x.userId === userId).map((x) => x.minutes));
  const leaveDays = (kind: string, list = mine) => list.filter((d) => d.kind === kind).length;
  const yearDays = (year.data?.days ?? []).filter((d) => d.userId === userId);
  // Newest first. Past days are all listed; future days only when leave is planned on them.
  const days = eachDayOfInterval({ start: from, end: to })
    .filter((d) => dayStr(d) <= today || index.day(userId, dayStr(d)))
    .reverse();

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label={t("worktime.stat.month")} value={`${fmt.hours(total)} h`} hint={total % 60 ? fmt.minutes(total) : undefined} />
        <Stat label={t("worktime.stat.days")} value={worked.length} hint={worked.length ? t("worktime.stat.averageHint", { hours: fmt.hours(total / worked.length) }) : undefined} />
        <Stat label={t("absence.vacation")} value={t("absence.days", { n: leaveDays("vacation") })} hint={year.data ? t("absence.inYear", { year: yearNo, n: leaveDays("vacation", yearDays) }) : undefined} />
        <Stat label={t("absence.sick")} value={t("absence.days", { n: leaveDays("sick") })} hint={year.data ? t("absence.inYear", { year: yearNo, n: leaveDays("sick", yearDays) }) : undefined} />
        <Stat label={t("worktime.stat.tickets")} value={onTickets ? fmt.minutes(onTickets) : "0 h"} hint={t("worktime.stat.ticketsHint")} />
      </div>

      {days.length ? (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
          {days.map((d) => {
            const date = dayStr(d);
            const entry = index.day(userId, date);
            const tickets = index.tickets(userId, date);
            const editable = canEditWorkDay(actor, userId, date, today);
            const weekend = isWeekend(d);
            const leave = entry && entry.kind !== "work" ? entry.kind : null;
            const corrected = entry?.updatedBy && entry.updatedBy !== userId ? member(entry.updatedBy)?.name : null;
            return (
              <li key={date} className={cx(weekend && !entry && "bg-surface-2/60")}>
                <div role="button" tabIndex={0} onClick={() => forms.open({ kind: "workday", userId, date })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), forms.open({ kind: "workday", userId, date }))} className="flex min-h-16 cursor-pointer items-start gap-3 px-3.5 py-2.5 hover:bg-surface-2 sm:px-4">
                  <span className={cx("flex w-11 shrink-0 flex-col items-center rounded-control py-1", date === today ? "bg-primary text-on-primary" : "bg-surface-3 text-fg", weekend && date !== today && "text-muted")}>
                    <span className="text-[0.6875rem] font-bold uppercase leading-none">{fmt.pattern(d, "EEEEEE")}</span>
                    <span className="text-lg font-extrabold leading-tight tabular-nums">{d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1 self-center">
                    {leave && date > today && <span className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-muted">{t("absence.planned")}</span>}
                    {entry?.note && <span className="block break-words text-[0.9375rem]">{entry.note}</span>}
                    {!entry && !tickets.length && <span className="block text-sm text-muted">{t(weekend ? "worktime.dayOff" : "worktime.noEntry")}</span>}
                    {!entry && tickets.length > 0 && <span className="block text-sm font-semibold text-warn">{t("worktime.ticketsButNoHours")}</span>}
                    <TicketChips items={tickets} />
                    {corrected && <span className="mt-1 block text-xs text-muted">{t("worktime.correctedByShort", { name: corrected })}</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 self-center">
                    {leave ? <AbsenceBadge kind={leave} /> : entry ? <span className="text-xl font-extrabold tabular-nums tracking-tight">{fmt.hours(entry.minutes)} h</span> : editable && <span className="rounded-full bg-primary-soft px-3 py-1.5 text-sm font-bold text-primary-ink">{t("common.add")}</span>}
                    {!editable ? <Lock size={16} className="text-muted" aria-label={t("worktime.locked")} /> : entry && <Pencil size={15} className="text-muted" aria-hidden />}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState icon={<Clock size={24} aria-hidden />} title={t("worktime.empty")} />
      )}
    </>
  );
}

// ---- Everyone: day list or week / month grid ---------------------------------

function Team({ period, from, to, label, onPerson }: { period: Period; from: Date; to: Date; label: string; onPerson: (userId: string) => void }) {
  const t = useT();
  const fmt = useFmt();
  const { locale } = useLocale();
  const { members } = useOrg();
  const forms = useForms();
  const today = todayStr();
  const query = useWorkTime(dayStr(from), dayStr(to));
  const index = useIndex(query.data);
  const data = query.data;

  // Current members, plus anyone else who has hours in this period (e.g. people who have since left).
  const people = useMemo(() => {
    const withHours = new Set((data?.days ?? []).map((d) => d.userId));
    return members.filter((m) => m.active || withHours.has(m.userId)).sort((a, b) => a.name.localeCompare(b.name));
  }, [members, data]);

  if (query.isPending) return <PageLoader />;
  const days = eachDayOfInterval({ start: from, end: to });
  const totalOf = (userId: string) => sum((data?.days ?? []).filter((d) => d.userId === userId).map((d) => d.minutes));
  const leaveOf = (userId: string, kind: string) => (data?.days ?? []).filter((d) => d.userId === userId && d.kind === kind).length;
  const grand = sum((data?.days ?? []).map((d) => d.minutes));
  const onTickets = sum((data?.ticketTime ?? []).map((x) => x.minutes));
  const logged = new Set((data?.days ?? []).map((d) => d.userId)).size;
  const leaveTotal = (kind: string) => (data?.days ?? []).filter((d) => d.kind === kind).length;

  const exportCsv = () => {
    // Polish spreadsheets expect ";" and a decimal comma; English ones "," and a dot.
    const sep = locale === "pl" ? ";" : ",";
    const cell = (value: string | number) => (typeof value === "number" ? fmt.hours(value) : `"${value.replaceAll('"', '""')}"`);
    const rows = [
      [t("worktime.person"), ...days.map((d) => dayStr(d)), t("worktime.totalHours"), t("absence.vacationDays"), t("absence.sickDays")].map((v) => `"${v}"`),
      ...people.map((p) => [
        cell(p.name),
        // Leave is written as a letter code so the sheet still sums the hours.
        ...days.map((d) => { const e = index.day(p.userId, dayStr(d)); return !e ? "" : e.kind === "work" ? cell(e.minutes) : cell(t(`absence.code.${e.kind}`)); }),
        cell(totalOf(p.userId)),
        String(leaveOf(p.userId, "vacation")),
        String(leaveOf(p.userId, "sick")),
      ]),
      [cell(t("worktime.total")), ...days.map((d) => cell(sum(people.map((p) => index.day(p.userId, dayStr(d))?.minutes ?? 0)))), cell(grand), String(leaveTotal("vacation")), String(leaveTotal("sick"))],
    ];
    const blob = new Blob([`\ufeff${rows.map((r) => r.join(sep)).join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${t("worktime.fileName")}-${dayStr(from)}_${dayStr(to)}.csv`;
    // Some browsers only start a download from a link that is in the page.
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Stat label={t("worktime.stat.total")} value={`${fmt.hours(grand)} h`} hint={grand % 60 ? fmt.minutes(grand) : undefined} />
        <Stat label={t("worktime.stat.people")} value={`${logged} / ${people.length}`} hint={t("worktime.stat.peopleHint")} />
        <Stat label={t("absence.title")} value={t("absence.days", { n: leaveTotal("vacation") + leaveTotal("sick") })} hint={`${t("absence.vacation")}: ${leaveTotal("vacation")} · ${t("absence.sick")}: ${leaveTotal("sick")}`} />
        <Stat label={t("worktime.stat.tickets")} value={onTickets ? fmt.minutes(onTickets) : "0 h"} hint={t("worktime.stat.ticketsHint")} />
      </div>
      {period !== "day" && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" icon={<Download size={16} aria-hidden />} onClick={exportCsv} title={label}>
            {t("worktime.export")}
          </Button>
        </div>
      )}

      {period === "day" ? (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
          {people.map((p) => {
            const date = dayStr(from);
            const entry = index.day(p.userId, date);
            const tickets = index.tickets(p.userId, date);
            return (
              <li key={p.userId}>
                <div role="button" tabIndex={0} onClick={() => forms.open({ kind: "workday", userId: p.userId, date })} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), forms.open({ kind: "workday", userId: p.userId, date }))} className="flex min-h-16 cursor-pointer items-start gap-3 px-3.5 py-3 hover:bg-surface-2 sm:px-4">
                  <Avatar name={p.name} size={36} className="mt-0.5 ring-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-bold">{p.name}</span>
                    {entry?.note && <span className="block break-words text-sm text-muted">{entry.note}</span>}
                    {!entry && <span className="block text-sm text-muted">{t("worktime.noEntry")}</span>}
                    <TicketChips items={tickets} />
                  </span>
                  {entry && entry.kind !== "work" ? (
                    <span className="shrink-0 self-center">
                      <AbsenceBadge kind={entry.kind} />
                    </span>
                  ) : (
                    <span className="shrink-0 self-center text-xl font-extrabold tabular-nums tracking-tight">{entry ? `${fmt.hours(entry.minutes)} h` : "—"}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Grid people={people} days={days} today={today} compact={period === "month"} entryOf={index.day} totalOf={totalOf} leaveOf={leaveOf} grand={grand} onCell={(userId, date) => forms.open({ kind: "workday", userId, date })} onPerson={onPerson} />
      )}
      <p className="mt-3 text-sm text-muted">
        {period !== "day" && (
          <>
            <span className={cx("mr-1 inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-xs font-bold", absenceMeta.vacation.cell)}>{t("absence.code.vacation")}</span>
            {t("absence.vacation")}
            <span className={cx("ml-3 mr-1 inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-xs font-bold", absenceMeta.sick.cell)}>{t("absence.code.sick")}</span>
            {t("absence.sick")}
            <span className="mx-2">·</span>
          </>
        )}
        {t("worktime.gridHint")}
      </p>
    </>
  );
}

interface GridProps {
  people: MemberDto[];
  days: Date[];
  today: string;
  /** Month: narrow columns. Week: roomy ones. */
  compact: boolean;
  entryOf: (userId: string, date: string) => WorkDayDto | undefined;
  totalOf: (userId: string) => number;
  leaveOf: (userId: string, kind: string) => number;
  grand: number;
  onCell: (userId: string, date: string) => void;
  onPerson: (userId: string) => void;
}

/** People × days. The name column stays put while the days scroll sideways on narrow screens. */
function Grid({ people, days, today, compact, entryOf, totalOf, leaveOf, grand, onCell, onPerson }: GridProps) {
  const t = useT();
  const fmt = useFmt();
  const sticky = "sticky left-0 z-10 bg-surface";
  const colTone = (d: Date) => (dayStr(d) === today ? "bg-primary-soft" : isWeekend(d) ? "bg-surface-2" : "");
  return (
    <div className="relative overflow-x-auto rounded-card border border-line bg-surface shadow-raise">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={cx(sticky, "px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-muted")}>
              {t("worktime.person")}
            </th>
            {days.map((d) => (
              <th key={dayStr(d)} scope="col" className={cx("px-0.5 py-1.5 text-center font-semibold", compact ? "min-w-9" : "min-w-16", colTone(d), isWeekend(d) && "text-muted")}>
                <span className="block text-[0.6875rem] uppercase leading-none text-muted">{fmt.pattern(d, compact ? "EEEEEE" : "EEE")}</span>
                <span className="block tabular-nums">{d.getDate()}</span>
              </th>
            ))}
            <th scope="col" className="sticky right-0 z-10 border-l border-line bg-surface px-3 py-2 text-right text-xs font-bold uppercase tracking-wide text-muted">
              {t("worktime.total")}
            </th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.userId} className="border-b border-line last:border-b-0">
              <th scope="row" className={cx(sticky, "max-w-40 p-0 text-left font-semibold sm:max-w-56")}>
                <button type="button" onClick={() => onPerson(p.userId)} className="flex min-h-12 w-full items-center gap-2.5 px-3 text-left hover:bg-surface-2" title={t("worktime.openPerson", { name: p.name })}>
                  <Avatar name={p.name} size={28} className="ring-0" />
                  <span className={cx("truncate", !p.active && "text-muted")}>{p.name}</span>
                </button>
              </th>
              {days.map((d) => {
                const date = dayStr(d);
                const entry = entryOf(p.userId, date);
                const leave = entry && entry.kind !== "work" ? entry.kind : null;
                const minutes = entry?.kind === "work" ? entry.minutes : 0;
                const future = date > today;
                const what = leave ? t(`absence.${leave}`) : minutes ? fmt.minutes(minutes) : t("worktime.noEntry");
                return (
                  <td key={date} className={cx("p-0 text-center", colTone(d))}>
                    <button
                      type="button"
                      onClick={() => onCell(p.userId, date)}
                      aria-label={`${p.name}, ${fmt.day(date)}: ${what}`}
                      title={leave ? what : undefined}
                      className={cx("flex min-h-12 w-full items-center justify-center tabular-nums hover:bg-primary-soft", minutes ? "font-bold" : "text-line-strong")}
                    >
                      {leave ? <span className={cx("inline-flex h-7 min-w-7 items-center justify-center rounded px-1 text-xs font-bold", absenceMeta[leave].cell)}>{t(`absence.code.${leave}`)}</span> : minutes ? fmt.hours(minutes) : future ? "" : "·"}
                    </button>
                  </td>
                );
              })}
              <td className="sticky right-0 z-10 border-l border-line bg-surface px-3 text-right tabular-nums">
                <span className="block text-base font-extrabold">{fmt.hours(totalOf(p.userId))}</span>
                {(leaveOf(p.userId, "vacation") > 0 || leaveOf(p.userId, "sick") > 0) && (
                  <span className="block whitespace-nowrap text-xs font-semibold text-muted">
                    {[leaveOf(p.userId, "vacation") && `${t("absence.code.vacation")} ${leaveOf(p.userId, "vacation")}`, leaveOf(p.userId, "sick") && `${t("absence.code.sick")} ${leaveOf(p.userId, "sick")}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-surface-2">
            <th scope="row" className="sticky left-0 z-10 bg-surface-2 px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wide text-muted">
              {t("worktime.total")}
            </th>
            {days.map((d) => {
              const minutes = sum(people.map((p) => entryOf(p.userId, dayStr(d))?.minutes ?? 0));
              return (
                <td key={dayStr(d)} className="px-0.5 text-center font-semibold tabular-nums text-muted">
                  {minutes ? fmt.hours(minutes) : ""}
                </td>
              );
            })}
            <td className="sticky right-0 z-10 border-l border-line bg-surface-2 px-3 text-right text-base font-extrabold tabular-nums">{fmt.hours(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
