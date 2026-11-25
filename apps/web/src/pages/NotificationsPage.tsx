import { AtSign, Bell, CalendarOff, CheckCheck, CircleDot, MessageSquare, UserPlus, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";
import type { NotificationDto, NotificationType } from "@sierra/shared";
import { Button, cx, EmptyState, PageHeader, PageLoader } from "../components/ui";
import { useTicketDrawer } from "../features/forms";
import { useFmt } from "../lib/format";
import { label, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useNotifications, useOrgApi } from "../lib/queries";

const icons: Record<NotificationType, LucideIcon> = { assigned: UserPlus, comment: MessageSquare, mention: AtSign, status: CircleDot, absence: CalendarOff };

export function NotificationsPage() {
  const t = useT();
  const fmt = useFmt();
  const { member, user, can } = useOrg();
  const navigate = useNavigate();
  const orgApi = useOrgApi();
  const act = useAct();
  const drawer = useTicketDrawer();
  const notifications = useNotifications();
  const items = notifications.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const text = (n: NotificationDto) => {
    const who = member(n.actorId)?.name ?? "—";
    if (n.type === "absence") {
      const kind = n.data.kind === "sick" ? "sick" : "vacation";
      const range = `${fmt.range(String(n.data.from), String(n.data.to))} (${t("absence.days", { n: Number(n.data.days) || 1 })})`;
      const about = String(n.data.userId);
      // Someone reported their own leave / a manager entered it for me / a manager entered it for someone else.
      if (about === n.actorId) return t(`notif.absence.own.${kind}`, { who, range });
      if (about === user.id) return t(`notif.absence.forYou.${kind}`, { who, range });
      return t(`notif.absence.other.${kind}`, { who, name: member(about)?.name ?? "—", range });
    }
    if (n.type === "status") return t("notif.status", { who, to: label(t, "status", String(n.data.to)) });
    return t(`notif.${n.type}`, { who });
  };
  const open = (n: NotificationDto) => {
    if (!n.readAt) void act(() => orgApi.post("/notifications/read", { id: n.id }));
    if (n.ticketId) drawer.open(n.ticketId);
    else if (n.type === "absence") navigate(can("worktime.manage") && n.data.userId !== user.id ? `/worktime?user=${String(n.data.userId)}&date=${String(n.data.from)}` : `/worktime?tab=mine&date=${String(n.data.from)}`);
  };

  return (
    <>
      <PageHeader
        title={t("nav.notifications")}
        actions={
          unread > 0 && (
            <Button icon={<CheckCheck size={18} aria-hidden />} onClick={() => act(() => orgApi.post("/notifications/read"))}>
              {t("notif.markAll")}
            </Button>
          )
        }
      />
      <div className="max-w-3xl">
        {notifications.isPending ? (
          <PageLoader />
        ) : items.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
            {items.map((n) => {
              const Icon = icons[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => open(n)} className={cx("flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-surface-2 sm:px-4", !n.readAt && "bg-primary-soft/50")}>
                    <span className={cx("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", n.readAt ? "bg-surface-3 text-muted" : "bg-primary text-on-primary")}>
                      <Icon size={17} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx("block text-[0.9375rem]", !n.readAt && "font-semibold")}>{text(n)}</span>
                      {n.ticketKey && (
                        <span className="block truncate text-sm text-muted">
                          <span className="font-semibold tabular-nums">{n.ticketKey}</span> {n.ticketTitle}
                        </span>
                      )}
                      <span className="text-xs text-muted">{fmt.ago(n.createdAt)}</span>
                    </span>
                    {!n.readAt && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label={t("notif.unread")} />}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<Bell size={24} aria-hidden />} title={t("notif.empty")} text={t("notif.emptyText")} />
        )}
      </div>
    </>
  );
}
