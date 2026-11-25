import { startOfWeek } from "date-fns";
import { AlertTriangle, ArrowRight, CircleCheck, ClipboardList, Clock, Flame, Plus, UserRound, type LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { isOpenStatus, type AssetDto } from "@sierra/shared";
import { activityText, assetDeadlines, assetIcon, AssetStatusBadge } from "../components/domain";
import { Avatar, Badge, Button, Card, cx, EmptyState, PageLoader, Section } from "../components/ui";
import { AwayList, useAway } from "../features/AwayList";
import { TicketLink, useForms } from "../features/forms";
import { smartSort, TicketList } from "../features/TicketRow";
import { dayStr, dueState, todayStr, useFmt } from "../lib/format";
import { useLocale, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useActivity, useAssets, useTickets, useWorkTime } from "../lib/queries";

function Stat({ to, icon: Icon, label, value, tone }: { to: string; icon: LucideIcon; label: string; value: number; tone: "primary" | "danger" | "warn" | "neutral" }) {
  const tones = { primary: "bg-primary-soft text-primary-ink", danger: "bg-danger-soft text-danger", warn: "bg-warn-soft text-warn", neutral: "bg-surface-3 text-fg" };
  return (
    <Link to={to} className="group rounded-card border border-line bg-surface p-3.5 shadow-raise transition-colors duration-150 hover:border-primary sm:p-4">
      <span className={cx("mb-2.5 flex size-9 items-center justify-center rounded-control", value ? tones[tone] : tones.neutral)}>
        <Icon size={19} aria-hidden />
      </span>
      <span className="block text-3xl font-extrabold leading-none tabular-nums tracking-tight">{value}</span>
      <span className="mt-1 block text-sm font-semibold text-muted">{label}</span>
    </Link>
  );
}

export function DashboardPage() {
  const t = useT();
  const fmt = useFmt();
  const { locale } = useLocale();
  const { user, org, can, member } = useOrg();
  const forms = useForms();
  const tickets = useTickets();
  const assets = useAssets();
  const activity = useActivity(12);

  const data = useMemo(() => {
    const open = (tickets.data ?? []).filter((x) => isOpenStatus(x.status)).sort(smartSort);
    const mine = open.filter((x) => x.assigneeIds.includes(user.id));
    const overdue = open.filter((x) => x.dueDate && dueState(x.dueDate).state === "overdue");
    const urgent = open.filter((x) => x.priority === "urgent" || x.priority === "high");
    const unassigned = open.filter((x) => !x.assigneeIds.length);
    return { open, mine, overdue, urgent, unassigned };
  }, [tickets.data, user.id]);

  const attention = useMemo(
    () =>
      (assets.data ?? [])
        .map((a) => ({ asset: a, deadlines: a.kind === "machine" ? assetDeadlines(a) : [] }))
        .filter((x) => x.deadlines.length || x.asset.status === "attention" || x.asset.status === "out_of_service")
        .sort((a, b) => (a.deadlines[0]?.days ?? 999) - (b.deadlines[0]?.days ?? 999)),
    [assets.data],
  );
  const assetMap = useMemo(() => new Map((assets.data ?? []).map((a) => [a.id, a])), [assets.data]);

  if (tickets.isPending) return <PageLoader />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? t("dash.morning") : hour < 18 ? t("dash.afternoon") : t("dash.evening");
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  const manager = can("tickets.editAny");
  const secondary = manager ? data.overdue.filter((x) => !data.mine.includes(x)) : [];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3 lg:mb-7">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-muted first-letter:uppercase">{today}</p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight lg:text-3xl">
            {greeting}, {user.name.split(" ")[0]}
          </h1>
        </div>
        {can("tickets.create") && (
          <Button variant="primary" icon={<Plus size={19} strokeWidth={2.5} aria-hidden />} onClick={() => forms.open({ kind: "ticket" })} className="hidden lg:inline-flex">
            {t("ticket.new")}
          </Button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <Stat to="/tickets?scope=mine" icon={UserRound} label={t("dash.stat.mine")} value={data.mine.length} tone="primary" />
        <Stat to="/tickets?due=overdue" icon={AlertTriangle} label={t("dash.stat.overdue")} value={data.overdue.length} tone="danger" />
        <Stat to="/tickets?sort=priority" icon={Flame} label={t("dash.stat.urgent")} value={data.urgent.length} tone="warn" />
        <Stat to="/tickets" icon={ClipboardList} label={t("dash.stat.open")} value={data.open.length} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-8">
        <div className="grid grid-cols-1 content-start gap-6">
          <Section
            title={t("dash.myTasks")}
            count={data.mine.length}
            actions={
              <Link to="/tickets?scope=mine" className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary-ink hover:underline">
                {t("common.all")} <ArrowRight size={15} aria-hidden />
              </Link>
            }
          >
            {data.mine.length ? <TicketList tickets={data.mine.slice(0, 6)} assets={assetMap} /> : <EmptyState icon={<CircleCheck size={24} aria-hidden />} title={t("dash.noTasks")} text={t("dash.noTasksText")} />}
          </Section>

          {secondary.length > 0 && (
            <Section title={t("dash.overdue")} count={secondary.length}>
              <TicketList tickets={secondary.slice(0, 6)} assets={assetMap} />
            </Section>
          )}

          {manager && data.unassigned.length > 0 && (
            <Section title={t("dash.unassigned")} count={data.unassigned.length}>
              <TicketList tickets={data.unassigned.slice(0, 5)} assets={assetMap} />
            </Section>
          )}
        </div>

        <div className="grid grid-cols-1 content-start gap-6">
          <HoursCard />
          <AwaySection />
          <Section
            title={t("dash.attention")}
            count={attention.length || undefined}
            actions={
              <Link to="/machines" className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary-ink hover:underline">
                {t("nav.machines")} <ArrowRight size={15} aria-hidden />
              </Link>
            }
          >
            {attention.length ? (
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
                {attention.slice(0, 6).map(({ asset, deadlines }) => (
                  <AttentionRow key={asset.id} asset={asset} deadlines={deadlines} />
                ))}
              </ul>
            ) : (
              <Card className="px-4 py-5 text-sm text-muted">{t("dash.attentionNone")}</Card>
            )}
          </Section>

          <Section title={t("dash.activity")}>
            {activity.data?.length ? (
              <ol className="grid grid-cols-1 gap-3.5 rounded-card border border-line bg-surface p-4 shadow-raise">
                {activity.data.map((a) => {
                  const actor = member(a.actorId);
                  const text = activityText(t, a, (uid) => member(uid)?.name ?? "—", fmt.day, fmt.minutes);
                  const body = (
                    <>
                      <span className="font-semibold text-fg">{actor?.name ?? "—"}</span> {text}
                      <span className="block truncate font-semibold text-fg">{a.entityLabel}</span>
                    </>
                  );
                  return (
                    <li key={a.id} className="flex gap-2.5">
                      <Avatar name={actor?.name ?? "?"} size={28} className="mt-0.5" />
                      <div className="min-w-0 flex-1 text-sm text-muted">
                        {a.action === "deleted" ? (
                          <div>{body}</div>
                        ) : a.entityType === "ticket" ? (
                          <TicketLink ticketId={a.entityId} className="block hover:underline">
                            {body}
                          </TicketLink>
                        ) : (
                          <Link to={`/assets/${a.entityId}`} className="block hover:underline">
                            {body}
                          </Link>
                        )}
                        <span className="text-xs">{fmt.ago(a.createdAt)}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <Card className="px-4 py-5 text-sm text-muted">{t("dash.activityNone")}</Card>
            )}
          </Section>
          <p className="text-center text-xs text-muted lg:text-left">{org.name}</p>
        </div>
      </div>
    </>
  );
}

/** Who is away now or soon. Everyone sees vacations; sick leave only reaches those allowed to see it. */
function AwaySection() {
  const t = useT();
  const periods = useAway(30);
  if (!periods?.length) return null;
  return (
    <Section
      title={t("absence.team")}
      count={periods.length}
      actions={
        <Link to="/worktime" className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary-ink hover:underline">
          {t("common.all")} <ArrowRight size={15} aria-hidden />
        </Link>
      }
    >
      <AwayList periods={periods.slice(0, 5)} />
    </Section>
  );
}

/** Today's hours at a glance, one tap from recording them. */
function HoursCard() {
  const t = useT();
  const fmt = useFmt();
  const { user, can } = useOrg();
  const forms = useForms();
  const today = todayStr();
  const weekStart = dayStr(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const monthStart = `${today.slice(0, 8)}01`;
  const mine = useWorkTime(weekStart < monthStart ? weekStart : monthStart, today, user.id);
  const days = (mine.data?.days ?? []).filter((d) => d.userId === user.id);
  const total = (from: string) => days.filter((d) => d.date >= from).reduce((sum, d) => sum + d.minutes, 0);
  const entry = days.find((d) => d.date === today);
  const leave = entry && entry.kind !== "work" ? entry.kind : null;
  return (
    <Section
      title={t("nav.worktime")}
      actions={
        <Link to="/worktime" className="inline-flex min-h-9 items-center gap-1 text-sm font-bold text-primary-ink hover:underline">
          {t(can("worktime.manage") ? "worktime.tab.team" : "common.all")} <ArrowRight size={15} aria-hidden />
        </Link>
      }
    >
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-control", entry ? "bg-primary-soft text-primary-ink" : "bg-surface-3 text-muted")}>
            <Clock size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("worktime.today")}</p>
            <p className="text-2xl font-extrabold leading-tight tabular-nums tracking-tight">{leave ? t(`absence.${leave}`) : entry ? `${fmt.hours(entry.minutes)} h` : "—"}</p>
          </div>
          <Button variant={entry ? "secondary" : "primary"} onClick={() => forms.open({ kind: "workday", date: today })}>
            {t(entry ? "worktime.change" : "worktime.log")}
          </Button>
        </div>
        <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
          <div>
            <dt className="text-muted">{t("worktime.stat.week")}</dt>
            <dd className="text-base font-bold tabular-nums">{fmt.hours(total(weekStart))} h</dd>
          </div>
          <div>
            <dt className="text-muted">{t("worktime.stat.month")}</dt>
            <dd className="text-base font-bold tabular-nums">{fmt.hours(total(monthStart))} h</dd>
          </div>
        </dl>
      </Card>
    </Section>
  );
}

function AttentionRow({ asset, deadlines }: { asset: AssetDto; deadlines: ReturnType<typeof assetDeadlines> }) {
  const t = useT();
  const fmt = useFmt();
  const Icon = assetIcon(asset);
  return (
    <li>
      <Link to={`/assets/${asset.id}`} className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-surface-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface-3 text-muted">
          <Icon size={19} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.9375rem] font-semibold">{asset.name}</span>
          <span className="mt-1 flex flex-wrap gap-1.5">
            {asset.status !== "operational" && <AssetStatusBadge status={asset.status} />}
            {deadlines.map((d) => (
              <Badge key={d.kind} tone={d.state === "overdue" ? "danger" : d.state === "later" ? "muted" : "warn"}>
                {t(`assets.deadline.${d.kind}`)}: {fmt.due(d.day)}
              </Badge>
            ))}
          </span>
        </span>
      </Link>
    </li>
  );
}
