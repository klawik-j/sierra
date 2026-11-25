import { Bell, Building2, ClipboardList, Clock, Contact, LayoutDashboard, Menu, Plus, Search, Settings, StickyNote, Tractor, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router";
import { useForms, useTicketDrawer } from "../features/forms";
import { CommandPalette } from "../features/Search";
import { TicketDrawer } from "../features/TicketDrawer";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useNotifications } from "../lib/queries";
import { Avatar, buttonClass, cx, iconButtonClass, optionClass } from "./ui";

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cx("flex items-center gap-2.5", className)} translate="no">
      <svg viewBox="0 0 512 512" className="size-8 shrink-0" aria-hidden>
        <rect width="512" height="512" rx="112" className="fill-primary" />
        <path d="M64 372 196 176l72 104 44-60 136 152z" className="fill-on-primary" />
        <circle cx="372" cy="150" r="38" className="fill-accent" />
      </svg>
      <span className="text-xl font-extrabold tracking-tight">Sierra</span>
    </span>
  );
}

function OrgSwitcher() {
  const t = useT();
  const { org, orgId, memberships, switchOrg } = useOrg();
  if (memberships.length < 2) return <p className="truncate px-1 text-sm font-semibold text-muted">{org.name}</p>;
  return (
    <select
      aria-label={t("org.switch")}
      value={orgId}
      onChange={(e) => switchOrg(e.target.value)}
      className={cx("w-full truncate rounded-control border border-line bg-surface-2 px-2.5 py-2 text-sm font-semibold text-fg", optionClass)}
      style={{ fontSize: "0.875rem" }}
    >
      {memberships.map((m) => (
        <option key={m.orgId} value={m.orgId}>
          {m.orgName}
        </option>
      ))}
    </select>
  );
}

export function Layout() {
  const t = useT();
  const { user, org } = useOrg();
  const forms = useForms();
  const drawer = useTicketDrawer();
  const loc = useLocation();
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.readAt).length;
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const at = (...prefixes: string[]) => prefixes.some((p) => (p === "/" ? loc.pathname === "/" : loc.pathname.startsWith(p)));
  const main: { to: string; label: string; icon: LucideIcon; active: boolean }[] = [
    { to: "/", label: t("nav.dashboard"), icon: LayoutDashboard, active: at("/") },
    { to: "/tickets", label: t("nav.tickets"), icon: ClipboardList, active: at("/tickets") },
    { to: "/worktime", label: t("nav.worktime"), icon: Clock, active: at("/worktime") },
    { to: "/machines", label: t("nav.machines"), icon: Tractor, active: at("/machines") },
    { to: "/buildings", label: t("nav.buildings"), icon: Building2, active: at("/buildings") },
    { to: "/notes", label: t("nav.notes"), icon: StickyNote, active: at("/notes") },
    { to: "/contacts", label: t("nav.contacts"), icon: Contact, active: at("/contacts") },
    { to: "/team", label: t("nav.team"), icon: Users, active: at("/team") },
  ];
  const mobile = [
    main[0]!,
    main[1]!,
    { to: "/machines", label: t("nav.assets"), icon: Tractor, active: at("/machines", "/buildings", "/assets") },
    main.find((n) => n.to === "/notes")!,
    { to: "/more", label: t("nav.more"), icon: Menu, active: at("/more", "/worktime", "/contacts", "/team", "/settings", "/notifications") },
  ];
  const quickAdd = () => forms.open({ kind: "quick" });
  const bell = (size: number) => (
    <span className="relative">
      <Bell size={size} aria-hidden />
      {unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-none text-surface">{unread > 9 ? "9+" : unread}</span>}
    </span>
  );

  return (
    <div className="min-h-dvh">
      <a href="#main" className="sr-only z-[60] rounded-control bg-primary px-4 py-3 font-semibold text-on-primary focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        {t("nav.skip")}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col gap-4 border-r border-line bg-surface px-3 py-4 lg:flex">
        <Link to="/" className="rounded-control px-1" aria-label="Sierra">
          <Brand />
        </Link>
        <OrgSwitcher />
        <button type="button" onClick={quickAdd} className={buttonClass({ variant: "primary", className: "w-full" })}>
          <Plus size={19} strokeWidth={2.5} aria-hidden /> {t("nav.new")}
        </button>
        <button type="button" onClick={() => setSearching(true)} className="flex min-h-10 items-center gap-2.5 rounded-control border border-line bg-surface-2 px-3 text-sm text-muted hover:border-line-strong/60">
          <Search size={17} aria-hidden />
          <span className="flex-1 text-left">{t("common.search")}</span>
          <kbd className="rounded border border-line bg-surface px-1.5 font-sans text-[0.6875rem] font-semibold">Ctrl K</kbd>
        </button>
        <nav aria-label={t("nav.main")} className="-mx-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1">
          {main.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              aria-current={n.active ? "page" : undefined}
              className={cx("flex min-h-10 items-center gap-3 rounded-control px-3 text-[0.9375rem] font-semibold transition-colors duration-150", n.active ? "bg-primary-soft text-primary-ink" : "text-muted hover:bg-surface-2 hover:text-fg")}
            >
              <n.icon size={19} aria-hidden />
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-1 border-t border-line pt-3">
          <Link to="/settings" className="flex min-h-tap min-w-0 flex-1 items-center gap-2.5 rounded-control px-1.5 hover:bg-surface-2" title={t("nav.settings")}>
            <Avatar name={user.name} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold">{user.name}</span>
              <span className="block truncate text-xs text-muted">{t("nav.settings")}</span>
            </span>
          </Link>
          <Link to="/notifications" className={iconButtonClass(at("/notifications") ? "bg-surface-3 text-fg" : undefined)} aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`} title={t("nav.notifications")}>
            {bell(20)}
          </Link>
        </div>
      </aside>

      {/* Phone / tablet header */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        <div className="flex h-14 items-center gap-1 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:pl-6 sm:pr-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="Sierra">
            <Brand className="[&>span]:hidden" />
            <span className="truncate text-base font-extrabold tracking-tight">{org.name}</span>
          </Link>
          <div className="ml-auto flex items-center">
            <button type="button" onClick={() => setSearching(true)} className={iconButtonClass()} aria-label={t("common.search")}>
              <Search size={22} aria-hidden />
            </button>
            <Link to="/notifications" className={iconButtonClass()} aria-label={`${t("nav.notifications")}${unread ? ` (${unread})` : ""}`}>
              {bell(22)}
            </Link>
            <Link to="/settings" className={iconButtonClass("hidden sm:inline-flex")} aria-label={t("nav.settings")}>
              <Settings size={22} aria-hidden />
            </Link>
          </div>
        </div>
      </header>

      <main
        id="main"
        tabIndex={-1}
        className="w-full px-[max(1rem,env(safe-area-inset-left))] pb-[calc(var(--spacing-nav)+6rem+env(safe-area-inset-bottom))] pt-5 outline-none sm:px-6 lg:pb-16 lg:pl-[calc(var(--spacing-sidebar)+2rem)] lg:pr-8 lg:pt-8 xl:pl-[calc(var(--spacing-sidebar)+3rem)] xl:pr-12"
      >
        <div className="mx-auto w-full max-w-content">
          <Outlet />
        </div>
      </main>

      <button
        type="button"
        onClick={quickAdd}
        className="fixed bottom-[calc(var(--spacing-nav)+1rem+env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-[35] flex size-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-fab transition-transform duration-150 active:scale-95 sm:right-6 lg:hidden"
        aria-label={t("nav.new")}
      >
        <Plus size={28} strokeWidth={2.5} aria-hidden />
      </button>

      <nav aria-label={t("nav.main")} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-nav max-w-xl grid-cols-5 px-[env(safe-area-inset-left)]">
          {mobile.map((n) => (
            <Link key={n.label} to={n.to} aria-current={n.active ? "page" : undefined} className={cx("flex flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-bold", n.active ? "text-primary-ink" : "text-muted")}>
              <span className={cx("flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-150", n.active && "bg-primary-soft")}>
                <n.icon size={22} aria-hidden />
              </span>
              {n.label}
            </Link>
          ))}
        </div>
      </nav>

      {drawer.id && <TicketDrawer key={drawer.id} id={drawer.id} onClose={drawer.close} />}
      {searching && <CommandPalette onClose={() => setSearching(false)} />}
    </div>
  );
}
