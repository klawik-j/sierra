import { Building2, ClipboardList, Clock, Contact, StickyNote, Tractor, TreePalm } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams, type LinkProps } from "react-router";
import type { AssetDto, AssetKind, ContactDto, DayKind, NoteDto, TicketDetailDto } from "@sierra/shared";
import { Modal } from "../components/ui";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { AssetForm } from "./AssetForm";
import { ContactForm } from "./ContactForm";
import { NoteForm } from "./NoteForm";
import { TicketForm } from "./TicketForm";
import { WorkDayForm } from "./WorkDayForm";

export type FormRequest =
  | { kind: "ticket"; ticket?: TicketDetailDto; preset?: { assetIds?: string[]; contactIds?: string[] } }
  | { kind: "note"; note?: NoteDto; preset?: { assetId?: string; ticketId?: string; contactId?: string } }
  | { kind: "asset"; asset?: AssetDto; assetKind: AssetKind }
  | { kind: "contact"; contact?: ContactDto }
  | { kind: "workday"; userId?: string; date?: string; dayKind?: DayKind }
  | { kind: "quick" };

const Ctx = createContext<{ open: (r: FormRequest) => void }>({ open: () => undefined });
export const useForms = () => useContext(Ctx);

/** One place that owns every create/edit dialog, so any screen can open them. */
export function FormsProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<FormRequest | null>(null);
  const open = useCallback((r: FormRequest) => setRequest(r), []);
  const close = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {request?.kind === "ticket" && <TicketForm ticket={request.ticket} preset={request.preset} onClose={close} />}
      {request?.kind === "note" && <NoteForm note={request.note} preset={request.preset} onClose={close} />}
      {request?.kind === "asset" && <AssetForm asset={request.asset} kind={request.assetKind} onClose={close} />}
      {request?.kind === "contact" && <ContactForm contact={request.contact} onClose={close} />}
      {request?.kind === "workday" && <WorkDayForm userId={request.userId} date={request.date} dayKind={request.dayKind} onClose={close} />}
      {request?.kind === "quick" && <QuickAdd onClose={close} onPick={open} />}
    </Ctx.Provider>
  );
}

function QuickAdd({ onClose, onPick }: { onClose: () => void; onPick: (r: FormRequest) => void }) {
  const t = useT();
  const { can } = useOrg();
  const options = [
    can("tickets.create") && { icon: ClipboardList, label: t("quick.ticket"), hint: t("quick.ticketHint"), request: { kind: "ticket" } as FormRequest },
    { icon: Clock, label: t("quick.hours"), hint: t("quick.hoursHint"), request: { kind: "workday" } as FormRequest },
    { icon: TreePalm, label: t("quick.absence"), hint: t("quick.absenceHint"), request: { kind: "workday", dayKind: "vacation" } as FormRequest },
    { icon: StickyNote, label: t("quick.note"), hint: t("quick.noteHint"), request: { kind: "note" } as FormRequest },
    can("assets.manage") && { icon: Tractor, label: t("quick.machine"), hint: t("quick.machineHint"), request: { kind: "asset", assetKind: "machine" } as FormRequest },
    can("assets.manage") && { icon: Building2, label: t("quick.building"), hint: t("quick.buildingHint"), request: { kind: "asset", assetKind: "building" } as FormRequest },
    can("contacts.manage") && { icon: Contact, label: t("quick.contact"), hint: t("quick.contactHint"), request: { kind: "contact" } as FormRequest },
  ].filter((o) => !!o);
  return (
    <Modal open onClose={onClose} title={t("quick.title")}>
      <ul className="-mx-1 grid grid-cols-1 gap-1.5 pb-1">
        {options.map((o) => (
          <li key={o.label}>
            <button type="button" onClick={() => onPick(o.request)} className="flex min-h-16 w-full items-center gap-3.5 rounded-card border border-line bg-surface px-3.5 py-2.5 text-left shadow-raise transition-colors duration-150 hover:border-primary hover:bg-primary-soft">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
                <o.icon size={22} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold">{o.label}</span>
                <span className="block text-sm text-muted">{o.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

// ---- Ticket drawer (URL-driven: ?t=<ticketId> on any screen) ----------------

const PARAM = "t";

export function useTicketDrawer() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const id = params.get(PARAM);
  const pushed = (location.state as { drawer?: boolean } | null)?.drawer === true;
  const open = useCallback(
    (ticketId: string) => {
      const next = new URLSearchParams(window.location.search);
      next.set(PARAM, ticketId);
      navigate({ search: next.toString() }, { state: { drawer: true } });
    },
    [navigate],
  );
  const close = useCallback(() => {
    // Opened from within the app: go back so the browser history stays clean. Deep link: just drop the parameter.
    if (pushed) return navigate(-1);
    const next = new URLSearchParams(window.location.search);
    next.delete(PARAM);
    navigate({ search: next.toString() }, { replace: true });
  }, [navigate, pushed]);
  return { id, open, close };
}

/** Link that opens a ticket in the drawer on top of the current screen. */
export function TicketLink({ ticketId, children, ...rest }: { ticketId: string } & Omit<LinkProps, "to" | "state">) {
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  next.set(PARAM, ticketId);
  return (
    <Link to={{ search: next.toString() }} state={{ drawer: true }} {...rest}>
      {children}
    </Link>
  );
}
