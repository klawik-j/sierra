import { ClipboardList, Contact, Search, StickyNote } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { assetIcon, StatusBadge } from "../components/domain";
import { cx, useFocusTrap, useLayer } from "../components/ui";
import { label, useT } from "../lib/i18n";
import { useAssets, useContacts, useNotes, useTickets } from "../lib/queries";
import { useForms, useTicketDrawer } from "./forms";

interface Hit {
  id: string;
  group: string;
  title: string;
  sub?: string;
  icon: ReactNode;
  trailing?: ReactNode;
  run: () => void;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l");

/** Global search over everything already loaded for the farm (Ctrl/⌘ K on desktop, the magnifier on phones). */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const navigate = useNavigate();
  const drawer = useTicketDrawer();
  const forms = useForms();
  const tickets = useTickets();
  const assets = useAssets();
  const contacts = useContacts();
  const notes = useNotes();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  useLayer(true, onClose);
  const ref = useFocusTrap<HTMLDivElement>(true);

  const hits = useMemo<Hit[]>(() => {
    const q = norm(query.trim());
    if (!q) return [];
    const match = (...parts: (string | null | undefined)[]) => norm(parts.filter(Boolean).join(" ")).includes(q);
    const go = (fn: () => void) => () => {
      onClose();
      // Let the palette unmount (and release its history-neutral layer) before navigating.
      setTimeout(fn, 0);
    };
    const out: Hit[] = [];
    for (const x of tickets.data ?? []) {
      if (match(x.key, x.title, x.labels.join(" "))) out.push({ id: x.id, group: t("nav.tickets"), title: x.title, sub: x.key, icon: <ClipboardList size={18} aria-hidden />, trailing: <StatusBadge status={x.status} />, run: go(() => drawer.open(x.id)) });
    }
    for (const a of assets.data ?? []) {
      const Icon = assetIcon(a);
      if (match(a.name, a.details.make, a.details.model, a.details.plate, a.details.vin)) {
        out.push({ id: a.id, group: t(a.kind === "machine" ? "nav.machines" : "nav.buildings"), title: a.name, sub: [label(t, "assetType", a.type), a.details.plate].filter(Boolean).join(" · "), icon: <Icon size={18} aria-hidden />, run: go(() => navigate(`/assets/${a.id}`)) });
      }
    }
    for (const c of contacts.data ?? []) {
      if (match(c.name, c.company, c.phone, c.phone2, c.email, c.address)) out.push({ id: c.id, group: t("nav.contacts"), title: c.name, sub: [c.company, c.phone].filter(Boolean).join(" · "), icon: <Contact size={18} aria-hidden />, run: go(() => navigate(`/contacts?q=${encodeURIComponent(c.name)}`)) });
    }
    for (const n of notes.data ?? []) {
      if (match(n.title, n.body)) out.push({ id: n.id, group: t("nav.notes"), title: n.title || n.body.split("\n")[0]!.slice(0, 80), sub: n.title ? n.body.slice(0, 80) : undefined, icon: <StickyNote size={18} aria-hidden />, run: go(() => forms.open({ kind: "note", note: n })) });
    }
    return out.slice(0, 40);
  }, [query, tickets.data, assets.data, contacts.data, notes.data, t, drawer, navigate, forms, onClose]);

  useEffect(() => setCursor(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center sm:p-6 sm:pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t("common.search")} tabIndex={-1} className="relative flex h-full w-full animate-fade-in flex-col overflow-hidden bg-surface shadow-pop outline-none sm:h-auto sm:max-h-[70vh] sm:max-w-xl sm:rounded-sheet">
        <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 pt-[env(safe-area-inset-top)]">
          <Search size={20} className="shrink-0 text-muted" aria-hidden />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                hits[cursor]?.run();
              }
            }}
            placeholder={t("search.placeholder")}
            aria-label={t("common.search")}
            className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          <button type="button" onClick={onClose} className="min-h-tap shrink-0 px-1 text-sm font-bold text-primary-ink">
            {t("common.close")}
          </button>
        </div>
        <ul ref={list} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {!query.trim() && <li className="px-3 py-8 text-center text-sm text-muted">{t("search.hint")}</li>}
          {query.trim() && !hits.length && <li className="px-3 py-8 text-center text-sm text-muted">{t("common.nothingFound")}</li>}
          {hits.map((h, i) => {
            const heading = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            return (
              <li key={`${h.group}:${h.id}`}>
                {heading && <p className="px-3 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted">{heading}</p>}
                <button type="button" data-index={i} onClick={h.run} onMouseMove={() => setCursor(i)} className={cx("flex min-h-12 w-full items-center gap-3 rounded-control px-3 py-1.5 text-left", i === cursor && "bg-primary-soft")}>
                  <span className="shrink-0 text-muted">{h.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] font-semibold">{h.title}</span>
                    {h.sub && <span className="block truncate text-sm text-muted">{h.sub}</span>}
                  </span>
                  {h.trailing}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
