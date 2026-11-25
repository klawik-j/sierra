import clsx, { type ClassValue } from "clsx";
import { CircleAlert, Loader2, Mic, MicOff, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { extendTailwindMerge } from "tailwind-merge";
import { useLocale, useT } from "../lib/i18n";

// Sierra's custom theme tokens, so later classes reliably override earlier ones (e.g. `size-9` over `size-tap`).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["tap", "nav", "sidebar"],
      radius: ["tag", "control", "card", "sheet"],
      shadow: ["raise", "pop", "fab"],
      container: ["content", "reading"],
      animate: ["sheet-in", "fade-in", "drawer-in"],
    },
  },
});

/** Joins class names; when two set the same property, the later one wins. */
export const cx = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

// ---- Buttons ---------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-raise",
  secondary: "bg-surface text-fg border border-line hover:bg-surface-2 shadow-raise",
  soft: "bg-primary-soft text-primary-ink hover:brightness-95",
  ghost: "text-fg hover:bg-surface-3",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm gap-1.5",
  md: "min-h-tap px-4 text-[0.9375rem] gap-2",
  lg: "min-h-12 px-5 text-base gap-2",
};

export function buttonClass({ variant = "secondary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cx(
    "inline-flex shrink-0 items-center justify-center rounded-control font-semibold transition-[background-color,filter,transform] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100",
    variants[variant],
    sizes[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  busy?: boolean;
}

export function Button({ variant, size, icon, busy, className, children, type = "button", disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass({ variant, size, className })} disabled={disabled || busy} aria-busy={busy || undefined} {...rest}>
      {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

export const iconButtonClass = (className?: string) =>
  cx("inline-flex size-tap shrink-0 items-center justify-center rounded-control text-muted transition-colors duration-150 hover:bg-surface-3 hover:text-fg disabled:opacity-50", className);

export function IconButton({ label, className, children, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type={type} className={iconButtonClass(className)} aria-label={label} title={label} {...rest}>
      {children}
    </button>
  );
}

// ---- Form controls ---------------------------------------------------------

const controlClass =
  "w-full rounded-control border border-line-strong/60 bg-surface px-3.5 text-fg shadow-raise transition-[border-color,box-shadow] duration-150 placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25 disabled:bg-surface-2 disabled:text-muted";

export function Input({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(controlClass, "min-h-tap", className)} {...rest} />;
}

export function Textarea({ className, rows = 3, ...rest }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cx(controlClass, "field-sizing-content max-h-[50dvh] min-h-20 py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(controlClass, "min-h-tap appearance-none pr-10", optionClass, className)} style={CHEVRON_STYLE} {...rest}>
      {children}
    </select>
  );
}
// Arrow as inline style: arbitrary `bg-[…]` position classes get mistaken for a background colour by tailwind-merge
// and would knock out `bg-surface`.
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d8778' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
const CHEVRON_STYLE = { backgroundImage: CHEVRON, backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", backgroundSize: "1.1rem" } as const;
/** The option list is drawn by the browser; give it the theme's colours explicitly. */
export const optionClass = "[&>option]:bg-surface [&>option]:text-fg";

export function Field({ label, hint, error, action, children, className }: { label: string; hint?: ReactNode; error?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  // The control comes before `action` in the DOM so the <label> targets the control, not the action button.
  return (
    <label data-invalid={error ? "" : undefined} className={cx("grid grid-cols-[minmax(0,1fr)_auto] content-start items-center gap-x-2", className)}>
      <span className="mb-1.5 flex min-h-6 items-center text-sm font-semibold text-fg">{label}</span>
      <span className={cx("col-span-2 row-start-2 block", error && "[&_input]:border-danger [&_select]:border-danger [&_textarea]:border-danger")}>{children}</span>
      {action && <span className="col-start-2 row-start-1 mb-1.5 flex items-center">{action}</span>}
      {error ? (
        <span role="alert" className="col-span-2 mt-1.5 flex items-start gap-1.5 text-sm font-semibold text-danger">
          <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
          {error}
        </span>
      ) : (
        hint && <span className="col-span-2 mt-1.5 block text-sm text-muted">{hint}</span>
      )}
    </label>
  );
}

/** Like Field, but for groups of controls (chips, pickers) where a wrapping <label> would misfire clicks. */
export function Group({ label, action, children, className }: { label: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className}>
      <div className="mb-1.5 flex min-h-6 items-center justify-between gap-2">
        <span className="text-sm font-semibold text-fg">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  return (
    <label className={cx("flex min-h-tap items-center gap-3 py-1", disabled && "opacity-60")}>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.9375rem] font-semibold">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className="relative h-7 w-12 shrink-0 rounded-full bg-surface-3 transition-colors duration-150 after:absolute after:left-0.5 after:top-0.5 after:size-6 after:rounded-full after:bg-surface after:shadow-raise after:transition-transform after:duration-150 peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
      />
    </label>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex max-w-full gap-1 overflow-x-auto rounded-control bg-surface-3 p-1 scrollbar-none", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[0.5rem] px-3 text-sm font-semibold transition-colors duration-150",
            o.value === value ? "bg-surface text-fg shadow-raise" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, className }: { active?: boolean; onClick?: () => void; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-semibold transition-colors duration-150",
        active ? "border-primary bg-primary-soft text-primary-ink" : "border-line bg-surface text-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---- Surfaces --------------------------------------------------------------

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("rounded-card border border-line bg-surface shadow-raise", className)} {...rest}>
      {children}
    </div>
  );
}

export function Section({ title, count, actions, children, className }: { title: ReactNode; count?: number; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2.5 flex min-h-9 items-center gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-surface-3 px-2 text-xs font-bold leading-5 text-muted">{count}</span>}
        <div className="ml-auto flex items-center gap-1.5">{actions}</div>
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3 lg:mb-7">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[0.9375rem] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "primary" | "info" | "warn" | "danger" | "muted";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-fg",
  primary: "bg-primary-soft text-primary-ink",
  info: "bg-info-soft text-info",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface-2 text-muted",
};

export function Badge({ tone = "neutral", icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-tag px-2 text-xs font-bold", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      title={name}
      aria-hidden
      className={cx("inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white ring-2 ring-surface", className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hash} 42% 40%)` }}
    >
      {initials || "?"}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line-strong/40 px-6 py-10 text-center">
      {icon && <span className="mb-1 flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary-ink">{icon}</span>}
      <p className="text-base font-bold">{title}</p>
      {text && <p className="max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("animate-spin text-muted", className)} size={24} aria-hidden />;
}

export function PageLoader() {
  const t = useT();
  return (
    <div role="status" className="flex min-h-[40dvh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner />
      {t("common.loading")}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-pulse rounded-control bg-surface-3", className)} />;
}

// ---- Layers (modal, drawer) ------------------------------------------------

const layers: symbol[] = [];
let scrollLocks = 0;

/** Registers an open overlay: locks page scroll and routes Escape to the top-most layer only. */
export function useLayer(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const id = Symbol();
    layers.push(id);
    if (scrollLocks++ === 0) document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && layers[layers.length - 1] === id) {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      layers.splice(layers.indexOf(id), 1);
      if (--scrollLocks === 0) document.body.style.overflow = "";
    };
  }, [open]);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Keeps Tab inside the element and restores focus to the opener when it unmounts. */
export function useFocusTrap<E extends HTMLElement>(open: boolean) {
  const ref = useRef<E>(null);
  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);
  return ref;
}

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** When set the panel is a <form>; put a submit button in `footer`. */
  onSubmit?: () => void;
  size?: "md" | "lg";
}

/** Bottom sheet on phones, centred dialog on larger screens. */
export function Modal({ open, onClose, title, children, footer, onSubmit, size = "md" }: ModalProps) {
  const t = useT();
  useLayer(open, onClose);
  const ref = useFocusTrap<HTMLDivElement>(open);
  if (!open) return null;
  const body = (
    <>
      <header className="flex shrink-0 items-center gap-3 border-b border-line py-2 pl-5 pr-2">
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h2>
        <IconButton label={t("common.close")} onClick={onClose}>
          <X size={22} aria-hidden />
        </IconButton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
      {footer && <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">{footer}</footer>}
    </>
  );
  const panelClass = "flex max-h-[92dvh] min-h-0 w-full flex-col";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-scrim" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cx("relative flex w-full animate-sheet-in flex-col overflow-hidden rounded-t-sheet bg-surface shadow-pop outline-none sm:rounded-sheet", size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg")}
      >
        {onSubmit ? (
          <form
            className={panelClass}
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            {body}
          </form>
        ) : (
          <div className={panelClass}>{body}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ---- Confirm ---------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const finish = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => finish(false)}
        title={state?.title ?? ""}
        footer={
          <>
            <Button variant="ghost" onClick={() => finish(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant={state?.danger ? "danger" : "primary"} onClick={() => finish(true)} autoFocus>
              {state?.confirmLabel ?? t("common.confirm")}
            </Button>
          </>
        }
      >
        <p className="text-[0.9375rem] text-muted">{state?.message}</p>
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// ---- Dictation -------------------------------------------------------------

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: () => void;
};
type SpeechCtor = new () => SpeechRec;

const speechCtor = () => (window as unknown as { SpeechRecognition?: SpeechCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: SpeechCtor }).webkitSpeechRecognition;

/** Joins dictated text onto existing text with sensible spacing. */
export function appendText(prev: string, addition: string) {
  const text = addition.trim();
  if (!text) return prev;
  if (!prev.trim()) return text.charAt(0).toUpperCase() + text.slice(1);
  return /[\s\n]$/.test(prev) ? prev + text : `${prev} ${text}`;
}

/**
 * Speak instead of typing (Web Speech API). Hidden where the browser has no speech
 * recognition; the phone keyboard's own microphone keeps working there.
 */
export function DictateButton({ onText, compact }: { onText: (text: string) => void; compact?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  const [active, setActive] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  useEffect(() => () => rec.current?.stop(), []);
  const Ctor = speechCtor();
  if (!Ctor) return null;
  const toggle = () => {
    if (active) {
      rec.current?.stop();
      return;
    }
    const r = new Ctor();
    r.lang = locale === "pl" ? "pl-PL" : "en-GB";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i]!.isFinal) onTextRef.current(e.results[i]![0].transcript.trim());
    };
    r.onend = () => setActive(false);
    r.onerror = () => setActive(false);
    rec.current = r;
    try {
      r.start();
      setActive(true);
    } catch {
      setActive(false);
    }
  };
  const text = active ? t("dictate.stop") : t("dictate.start");
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={text}
      title={text}
      className={cx(
        "inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors duration-150",
        active ? "animate-pulse bg-danger text-surface" : "bg-primary-soft text-primary-ink hover:brightness-95",
      )}
    >
      {active ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
      {!compact && text}
    </button>
  );
}

/** Stable id helper for label/input pairs outside <Field>. */
export const useFieldId = useId;
