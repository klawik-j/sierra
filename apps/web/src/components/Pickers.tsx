import { Check, Plus, Search, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { contactCategories } from "@sierra/shared";
import { label as enumLabel, useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAssets, useContacts } from "../lib/queries";
import { assetIcon } from "./domain";
import { Avatar, Button, cx, Group, Input, Modal } from "./ui";

export interface PickItem {
  id: string;
  label: string;
  sub?: string;
  icon?: ReactNode;
  /** Section heading the item is listed under. */
  group?: string;
}

interface PickerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  items: PickItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  emptyText?: string;
}

export function PickerModal({ open, onClose, title, items, selected, onChange, multiple = true, emptyText }: PickerModalProps) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((i) => `${i.label} ${i.sub ?? ""}`.toLowerCase().includes(q)) : items;
  const toggle = (id: string) => {
    if (!multiple) {
      onChange(selected.includes(id) ? [] : [id]);
      onClose();
      return;
    }
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  let lastGroup: string | undefined;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        multiple ? (
          <Button variant="primary" onClick={onClose}>
            {t("common.done")}
          </Button>
        ) : undefined
      }
    >
      {items.length > 6 && (
        <div className="relative mb-3">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("common.search")} className="pl-10" aria-label={t("common.search")} />
        </div>
      )}
      {!shown.length && <p className="py-6 text-center text-sm text-muted">{emptyText ?? t("common.nothingFound")}</p>}
      <ul className="-mx-2">
        {shown.map((item) => {
          const active = selected.includes(item.id);
          const heading = item.group !== lastGroup ? item.group : undefined;
          lastGroup = item.group;
          return (
            <li key={item.id}>
              {heading && <p className="px-2 pb-1 pt-3 text-xs font-bold uppercase tracking-wide text-muted">{heading}</p>}
              <button
                type="button"
                role={multiple ? "checkbox" : "radio"}
                aria-checked={active}
                onClick={() => toggle(item.id)}
                className={cx("flex min-h-12 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left transition-colors duration-150 hover:bg-surface-2", active && "bg-primary-soft hover:bg-primary-soft")}
              >
                {item.icon}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold">{item.label}</span>
                  {item.sub && <span className="block truncate text-sm text-muted">{item.sub}</span>}
                </span>
                <span className={cx("flex size-6 shrink-0 items-center justify-center rounded-full border-2", active ? "border-primary bg-primary text-on-primary" : "border-line-strong/50")}>
                  {active && <Check size={14} strokeWidth={3} aria-hidden />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

interface MultiPickProps {
  label: string;
  items: PickItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  addLabel: string;
  multiple?: boolean;
  emptyText?: string;
}

/** Selected items as removable chips plus an "add" chip that opens the picker. */
export function MultiPick({ label, items, value, onChange, addLabel, multiple, emptyText }: MultiPickProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  return (
    <Group label={label}>
      <div className="flex flex-wrap gap-1.5">
        {value.map((id) => {
          const item = byId.get(id);
          if (!item) return null;
          return (
            <span key={id} className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-surface-3 py-0.5 pl-1.5 pr-1 text-sm font-semibold">
              {item.icon}
              <span className="truncate">{item.label}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x !== id))} className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-fg" aria-label={`${t("common.remove")}: ${item.label}`}>
                <X size={15} aria-hidden />
              </button>
            </span>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-dashed border-line-strong/60 px-3 text-sm font-semibold text-muted hover:border-primary hover:text-primary-ink">
          <Plus size={16} aria-hidden />
          {addLabel}
        </button>
      </div>
      <PickerModal open={open} onClose={() => setOpen(false)} title={label} items={items} selected={value} onChange={onChange} multiple={multiple} emptyText={emptyText} />
    </Group>
  );
}

export function useMemberItems(): PickItem[] {
  const { activeMembers } = useOrg();
  const t = useT();
  return useMemo(() => activeMembers.map((m) => ({ id: m.userId, label: m.name, sub: t(`role.${m.role}`), icon: <Avatar name={m.name} size={28} className="ring-0" /> })), [activeMembers, t]);
}

export function useAssetItems(): PickItem[] {
  const assets = useAssets();
  const t = useT();
  return useMemo(
    () =>
      [...(assets.data ?? [])]
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "machine" ? -1 : 1))
        .map((a) => {
          const Icon = assetIcon(a);
          return {
            id: a.id,
            label: a.name,
            sub: enumLabel(t, "assetType", a.type),
            group: t(a.kind === "machine" ? "nav.machines" : "nav.buildings"),
            icon: (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
                <Icon size={15} aria-hidden />
              </span>
            ),
          };
        }),
    [assets.data, t],
  );
}

export function useContactItems(): PickItem[] {
  const contacts = useContacts();
  const t = useT();
  return useMemo(
    () =>
      [...(contacts.data ?? [])]
        .sort((a, b) => contactCategories.indexOf(a.category) - contactCategories.indexOf(b.category) || a.name.localeCompare(b.name))
        .map((c) => ({ id: c.id, label: c.name, sub: c.company ?? c.phone ?? undefined, group: t(`contactCat.${c.category}`), icon: <Avatar name={c.name} size={28} className="ring-0" /> })),
    [contacts.data, t],
  );
}
