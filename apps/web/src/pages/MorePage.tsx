import { Bell, ChevronRight, Clock, Contact, Settings, Users, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { BuildingsIcon } from "../components/assetIcons";
import { RoleBadge } from "../components/domain";
import { Avatar, PageHeader } from "../components/ui";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useNotifications } from "../lib/queries";

/** Phone-only hub for the sections that do not fit in the bottom bar. */
export function MorePage() {
  const t = useT();
  const { user, role, org } = useOrg();
  const unread = (useNotifications().data ?? []).filter((n) => !n.readAt).length;
  const items: { to: string; icon: LucideIcon; label: string; hint: string; badge?: number }[] = [
    { to: "/worktime", icon: Clock, label: t("nav.worktime"), hint: t("more.worktime") },
    { to: "/buildings", icon: BuildingsIcon, label: t("nav.buildings"), hint: t("more.buildings") },
    { to: "/contacts", icon: Contact, label: t("nav.contacts"), hint: t("more.contacts") },
    { to: "/team", icon: Users, label: t("nav.team"), hint: t("more.team") },
    { to: "/notifications", icon: Bell, label: t("nav.notifications"), hint: t("more.notifications"), badge: unread },
    { to: "/settings", icon: Settings, label: t("nav.settings"), hint: t("more.settings") },
  ];
  return (
    <>
      <PageHeader title={t("nav.more")} />
      <div className="grid max-w-xl grid-cols-1 gap-4">
        <Link to="/settings" className="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-raise">
          <Avatar name={user.name} size={48} className="ring-0" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-bold">{user.name}</span>
            <span className="block truncate text-sm text-muted">{org.name}</span>
          </span>
          <RoleBadge role={role} />
        </Link>
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
          {items.map((i) => (
            <li key={i.to}>
              <Link to={i.to} className="flex min-h-16 items-center gap-3.5 px-4 py-2.5 hover:bg-surface-2">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
                  <i.icon size={20} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold">{i.label}</span>
                  <span className="block truncate text-sm text-muted">{i.hint}</span>
                </span>
                {!!i.badge && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-surface">{i.badge}</span>}
                <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
