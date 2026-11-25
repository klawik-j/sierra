import { useState } from "react";
import { priorities, ticketStatuses, type Priority, type TicketDetailDto, type TicketStatus } from "@sierra/shared";
import { MultiPick, useAssetItems, useContactItems, useMemberItems } from "../components/Pickers";
import { appendText, Button, Chip, DictateButton, Field, Group, Input, Modal, Segmented, Select, Textarea, Toggle } from "../components/ui";
import { minutesToHours, parseHours, todayStr } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useOrgApi } from "../lib/queries";
import { useFormErrors, type FieldErrors } from "../lib/validation";
import { useTicketDrawer } from "./forms";

interface Props {
  ticket?: TicketDetailDto;
  preset?: { assetIds?: string[]; contactIds?: string[] };
  onClose: () => void;
}

export function TicketForm({ ticket, preset, onClose }: Props) {
  const t = useT();
  const { can, categories, user } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const drawer = useTicketDrawer();
  const memberItems = useMemberItems();
  const assetItems = useAssetItems();
  const contactItems = useContactItems();
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(!!ticket);
  const [f, setF] = useState(() => ({
    title: ticket?.title ?? "",
    description: ticket?.description ?? "",
    status: (ticket?.status ?? "todo") as TicketStatus,
    priority: (ticket?.priority ?? "normal") as Priority,
    categoryId: ticket?.categoryId ?? "",
    assigneeIds: ticket?.assigneeIds ?? [],
    assetIds: ticket?.assetIds ?? preset?.assetIds ?? [],
    contactIds: ticket?.contactIds ?? preset?.contactIds ?? [],
    dueDate: ticket?.dueDate ?? "",
    estimate: minutesToHours(ticket?.estimateMinutes ?? null),
    labels: (ticket?.labels ?? []).join(", "),
  }));
  const form = useFormErrors({
    title: t("ticket.title"),
    description: t("ticket.description"),
    dueDate: t("ticket.dueDate"),
    estimateMinutes: t("ticket.estimate"),
    labels: t("ticket.labels"),
    categoryId: t("ticket.category"),
  });
  /** Form key -> field path as the API reports it. */
  const paths: Partial<Record<keyof typeof f, string>> = { estimate: "estimateMinutes" };
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => {
    form.clear(paths[key] ?? key);
    setF((prev) => ({ ...prev, [key]: value }));
  };
  const canAssign = can("tickets.assign");

  const submit = async () => {
    const labels = f.labels
      .split(",")
      .map((l) => l.trim())
      .filter(Boolean);
    const found: FieldErrors = {};
    if (!f.title.trim()) found.title = t("invalid.required");
    if (f.estimate.trim() && parseHours(f.estimate) === null) found.estimateMinutes = t("invalid.hours");
    if (labels.length > 10) found.labels = t("invalid.maxItems", { n: 10 });
    else if (labels.some((l) => l.length > 30)) found.labels = t("invalid.maxLength", { n: 30 });
    // The optional fields may be folded away; open them so the message is visible.
    if (found.estimateMinutes || found.labels) setMore(true);
    if (!form.check(found)) return;
    const body = {
      title: f.title,
      description: f.description,
      status: f.status,
      priority: f.priority,
      categoryId: f.categoryId || null,
      assigneeIds: f.assigneeIds,
      assetIds: f.assetIds,
      contactIds: f.contactIds,
      dueDate: f.dueDate || null,
      estimateMinutes: parseHours(f.estimate),
      labels,
    };
    setBusy(true);
    let result: unknown;
    if (ticket) {
      // Send only what changed: keeps the history meaningful and respects per-field permissions.
      const before: Record<string, unknown> = { ...ticket, description: ticket.description ?? "" };
      const changed = Object.fromEntries(Object.entries({ ...body, description: body.description.trim() }).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
      result = Object.keys(changed).length ? await act(() => orgApi.patch(`/tickets/${ticket.id}`, changed), t("common.saved"), form) : true;
    } else {
      result = await act(() => orgApi.post<{ id: string; key: string }>("/tickets", body), undefined, form);
    }
    if (!result) setMore(true);
    setBusy(false);
    if (!result) return;
    onClose();
    // Straight into the new ticket: the next step is usually a "before" photo.
    if (!ticket) drawer.open((result as { id: string }).id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={submit}
      size="lg"
      title={ticket ? `${t("ticket.edit")} ${ticket.key}` : t("ticket.new")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {ticket ? t("common.save") : t("ticket.create")}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <Field label={t("ticket.title")} error={form.of("title")} action={<DictateButton compact onText={(text) => set("title", appendText(f.title, text))} />}>
          <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder={t("ticket.titlePlaceholder")} maxLength={200} autoFocus={!ticket && window.matchMedia("(min-width: 640px)").matches} />
        </Field>
        <Field label={t("ticket.description")} error={form.of("description")} action={<DictateButton onText={(text) => set("description", appendText(f.description, text))} />}>
          <Textarea value={f.description} onChange={(e) => set("description", e.target.value)} placeholder={t("ticket.descriptionPlaceholder")} rows={4} />
        </Field>

        <Group label={t("ticket.priority")}>
          <Segmented label={t("ticket.priority")} value={f.priority} onChange={(v) => set("priority", v)} options={priorities.map((p) => ({ value: p, label: t(`priority.${p}`) }))} className="flex w-full" />
        </Group>

        {canAssign ? (
          <MultiPick label={t("ticket.assignees")} addLabel={t("ticket.addAssignee")} items={memberItems} value={f.assigneeIds} onChange={(v) => set("assigneeIds", v)} />
        ) : (
          <Toggle label={t("ticket.assignToMe")} checked={f.assigneeIds.includes(user.id)} onChange={(v) => set("assigneeIds", v ? [...f.assigneeIds, user.id] : f.assigneeIds.filter((u) => u !== user.id))} />
        )}

        <MultiPick label={t("ticket.assets")} addLabel={t("ticket.addAsset")} items={assetItems} value={f.assetIds} onChange={(v) => set("assetIds", v)} emptyText={t("assets.empty")} />

        <Group label={t("ticket.dueDate")}>
          <div className="flex flex-wrap items-center gap-1.5">
            <Input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="w-auto min-w-40 flex-1 sm:flex-none" aria-label={t("ticket.dueDate")} />
            <Chip active={f.dueDate === todayStr()} onClick={() => set("dueDate", todayStr())}>
              {t("due.today")}
            </Chip>
            <Chip active={f.dueDate === todayStr(1)} onClick={() => set("dueDate", todayStr(1))}>
              {t("due.tomorrow")}
            </Chip>
            <Chip active={f.dueDate === todayStr(7)} onClick={() => set("dueDate", todayStr(7))}>
              {t("due.inWeek")}
            </Chip>
          </div>
        </Group>

        {!more && (
          <button type="button" onClick={() => setMore(true)} className="min-h-tap justify-self-start text-sm font-bold text-primary-ink underline-offset-2 hover:underline">
            {t("ticket.moreOptions")}
          </button>
        )}
        {more && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {ticket && (
                <Field label={t("ticket.status")}>
                  <Select value={f.status} onChange={(e) => set("status", e.target.value as TicketStatus)}>
                    {ticketStatuses.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Field label={t("ticket.category")}>
                <Select value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
                  <option value="">{t("common.none")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("ticket.estimate")} hint={t("ticket.estimateHint")} error={form.of("estimateMinutes")}>
                <Input value={f.estimate} onChange={(e) => set("estimate", e.target.value)} inputMode="decimal" placeholder="2.5" />
              </Field>
              <Field label={t("ticket.labels")} hint={t("ticket.labelsHint")} error={form.of("labels")}>
                <Input value={f.labels} onChange={(e) => set("labels", e.target.value)} />
              </Field>
            </div>
            <MultiPick label={t("ticket.contacts")} addLabel={t("ticket.addContact")} items={contactItems} value={f.contactIds} onChange={(v) => set("contactIds", v)} emptyText={t("contacts.empty")} />
          </>
        )}
      </div>
    </Modal>
  );
}
