import { Briefcase, ClipboardList, Eye, EyeOff, Lock, Minus, Plus, Thermometer, Trash2, TreePalm } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ABSENCE_MAX_DAYS_AHEAD, canEditWorkDay, canWorkOnTicket, isOpenStatus, workDayWindowStart, type AbsenceKind, type AbsenceResultDto, type DayKind } from "@sierra/shared";
import { PickerModal, type PickItem } from "../components/Pickers";
import { appendText, Avatar, Button, Chip, cx, DictateButton, Field, Group, IconButton, Input, Modal, Segmented, Spinner, Textarea, Toggle, useConfirm } from "../components/ui";
import { countDays, shiftDay, toPeriods } from "../lib/absences";
import { parseHours, todayStr, useFmt } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useOrgApi, useTickets, useWorkTime } from "../lib/queries";
import { useToast } from "../lib/toast";
import { useFormErrors } from "../lib/validation";
import { useTicketDrawer } from "./forms";

const QUICK_HOURS = [4, 6, 8, 10, 12];
const DAY_MINUTES = 24 * 60;

interface Props {
  userId?: string;
  date?: string;
  /** Preselects Work / Vacation / Sick leave for a new entry. */
  dayKind?: DayKind;
  onClose: () => void;
}

/**
 * One person's day: hours worked (plus the tickets they logged time on — the two are independent),
 * or leave. Leave is entered as a from–to range and may lie in the future.
 */
export function WorkDayForm({ userId: forUser, date: initialDate, dayKind, onClose }: Props) {
  const t = useT();
  const fmt = useFmt();
  const { user, actor, can, member } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const toast = useToast();
  const confirm = useConfirm();
  const drawer = useTicketDrawer();
  const allTickets = useTickets();

  const userId = forUser ?? user.id;
  const self = userId === user.id;
  const manage = can("worktime.manage");
  const person = member(userId);
  const today = todayStr();
  const opened = initialDate ?? today;

  const [kind, setKind] = useState<DayKind>(dayKind ?? (opened > today ? "vacation" : "work"));
  /** The day (work) or the first day (leave). */
  const [date, setDate] = useState(opened);
  const [to, setTo] = useState(opened);
  const [weekdaysOnly, setWeekdaysOnly] = useState(true);
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** The leave period being edited, as it was when the dialog opened. */
  const [orig, setOrig] = useState<{ from: string; to: string } | null>(null);
  const form = useFormErrors({ minutes: t("worktime.hours"), note: t("worktime.note"), from: t("absence.from"), to: t("absence.to") });

  const leave = kind !== "work";
  const dayQuery = useWorkTime(date, date, userId);
  const existing = dayQuery.data?.days.find((d) => d.userId === userId && d.date === date);
  const onTickets = (dayQuery.data?.ticketTime ?? []).filter((x) => x.userId === userId && x.date === date);
  const ticketMinutes = onTickets.reduce((sum, x) => sum + x.minutes, 0);

  // Once, on opening an existing leave day: load the days around it and show the whole period it belongs to.
  const around = useWorkTime(shiftDay(opened, -45), shiftDay(opened, 45), userId);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready || !around.data) return;
    const mine = around.data.days.filter((d) => d.userId === userId);
    const here = mine.find((d) => d.date === opened);
    if (here && here.kind !== "work" && !dayKind) {
      const period = toPeriods(mine.filter((d) => d.kind === here.kind)).find((p) => p.from <= opened && opened <= p.to);
      if (period) {
        setKind(here.kind);
        setDate(period.from);
        setTo(period.to);
        setNote(here.note ?? "");
        setWeekdaysOnly(countDays(period.from, period.to, false) !== period.days);
        setOrig({ from: period.from, to: period.to });
      }
    }
    setReady(true);
  }, [around.data, ready, opened, userId, dayKind]);

  // Working day: fill hours and note once per day shown; later refetches must not overwrite what is being typed.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || leave || !dayQuery.data || loadedFor === date) return;
    const worked = existing?.kind === "work" ? existing : undefined;
    setHours(worked ? fmt.hours(worked.minutes) : "");
    setNote(worked?.note ?? "");
    setLoadedFor(date);
  }, [ready, leave, dayQuery.data, existing, date, loadedFor, fmt]);

  const pickKind = (next: DayKind) => {
    form.check({});
    setKind(next);
    // Hours can only be recorded up to today.
    if (next === "work" && date > today) setDate(today);
    if (next !== "work" && to < date) setTo(date);
  };

  const earliest = manage ? undefined : workDayWindowStart(today);
  const latestLeave = shiftDay(today, ABSENCE_MAX_DAYS_AHEAD);
  const editable = !!date && canEditWorkDay(actor, userId, date, today) && (leave || date <= today);
  const minutes = parseHours(hours);
  const setMinutes = (value: number) => {
    form.clear("minutes");
    setHours(fmt.hours(Math.min(DAY_MINUTES, Math.max(0, value))));
  };
  const dayCount = leave && date && to && date <= to ? countDays(date, to, date !== to && weekdaysOnly) : 0;

  const saveWork = async () => {
    if (!hours.trim()) return void form.check({ minutes: t("invalid.required") });
    if (minutes === null || minutes < 1 || minutes > DAY_MINUTES) return void form.check({ minutes: t("worktime.invalidHours") });
    setBusy(true);
    const ok = await act(() => orgApi.put(`/worktime/${userId}/${date}`, { kind: "work", minutes, note }), t("worktime.saved"), form);
    setBusy(false);
    if (ok) onClose();
  };

  const saveLeave = async (leaveKind: AbsenceKind) => {
    if (!date) return void form.check({ from: t("invalid.required") });
    if (!to || to < date) return void form.check({ to: t("absence.invalidRange") });
    if (to > latestLeave) return void form.check({ to: t("err.too_far_ahead") });
    if (!dayCount) return void form.check({ to: t("err.no_days") });
    setBusy(true);
    const result = await act(async (): Promise<AbsenceResultDto> => {
      // A single day is set explicitly (it may replace recorded hours); a range leaves worked days alone.
      const res = date === to ? ((await orgApi.put(`/worktime/${userId}/${date}`, { kind: leaveKind, note })), { saved: [date], skipped: [] }) : await orgApi.post<AbsenceResultDto>("/absences", { userId, kind: leaveKind, from: date, to, weekdaysOnly, note });
      // Editing an existing period: whatever now falls outside the new dates is cancelled.
      if (orig) {
        if (orig.from < date) await orgApi.del(`/absences?userId=${userId}&from=${orig.from}&to=${shiftDay(date, -1) < orig.to ? shiftDay(date, -1) : orig.to}`);
        if (orig.to > to) await orgApi.del(`/absences?userId=${userId}&from=${shiftDay(to, 1) > orig.from ? shiftDay(to, 1) : orig.from}&to=${orig.to}`);
      }
      return res;
    }, undefined, form);
    setBusy(false);
    if (!result) return;
    if (result.skipped.length) toast.push(t("absence.savedSkipped", { saved: result.saved.length, skipped: result.skipped.map((d) => fmt.day(d)).join(", ") }), "error");
    else toast.push(t(`absence.saved.${leaveKind}`, { range: fmt.range(date, to) }));
    onClose();
  };

  const save = () => {
    if (!editable) return;
    return kind === "work" ? saveWork() : saveLeave(kind);
  };

  const remove = async () => {
    if (orig) {
      if (!(await confirm({ title: t("absence.deleteTitle"), message: t("absence.deleteText", { range: fmt.range(orig.from, orig.to) }), confirmLabel: t("common.delete"), danger: true }))) return;
      if (await act(() => orgApi.del(`/absences?userId=${userId}&from=${orig.from}&to=${orig.to}`))) onClose();
      return;
    }
    if (!(await confirm({ title: t("worktime.deleteTitle"), message: t("worktime.deleteText", { date: fmt.day(date) }), confirmLabel: t("common.delete"), danger: true }))) return;
    if (await act(() => orgApi.del(`/worktime/${userId}/${date}`))) onClose();
  };

  // ---- time on a ticket (own day only: ticket time is always logged as the person doing the work)
  const [picking, setPicking] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [ticketHours, setTicketHours] = useState("");
  const candidates = useMemo<PickItem[]>(() => {
    const list = (allTickets.data ?? []).filter((x) => canWorkOnTicket(actor, x) && (isOpenStatus(x.status) || x.updatedAt.slice(0, 10) >= date));
    const rank = (x: (typeof list)[number]) => (x.assigneeIds.includes(user.id) ? 0 : 1);
    return list
      .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt))
      .map((x) => ({ id: x.id, label: x.title, sub: x.key, group: t(rank(x) === 0 ? "worktime.ticketsMine" : "worktime.ticketsOther"), icon: <ClipboardList size={18} className="shrink-0 text-muted" aria-hidden /> }));
  }, [allTickets.data, actor, user.id, date, t]);
  const picked = allTickets.data?.find((x) => x.id === ticketId);
  const ticketMin = parseHours(ticketHours);
  const addTicketTime = async () => {
    if (!picked || !ticketMin) return;
    if (await act(() => orgApi.post(`/tickets/${picked.id}/time`, { minutes: ticketMin, date }))) {
      setTicketId(null);
      setTicketHours("");
    }
  };
  const openTicket = (id: string) => {
    onClose();
    drawer.open(id);
  };

  const canDelete = editable && (orig ? leave : !leave && existing?.kind === "work");
  return (
    <Modal
      open
      onClose={onClose}
      onSubmit={save}
      title={self ? t("worktime.myDay") : t("worktime.dayOf", { name: person?.name ?? "—" })}
      footer={
        editable ? (
          <>
            {canDelete && (
              <Button variant="danger" icon={<Trash2 size={18} aria-hidden />} onClick={remove} className="mr-auto" aria-label={t("common.delete")}>
                <span className="hidden sm:inline">{t("common.delete")}</span>
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" busy={busy} disabled={!ready || (!leave && loadedFor !== date)}>
              {leave && dayCount > 1 ? t("absence.saveDays", { n: dayCount }) : t("common.save")}
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>{t("common.close")}</Button>
        )
      }
    >
      <div className={cx("grid grid-cols-1 gap-4", !ready && "hidden")}>
        {!self && person && (
          <p className="flex items-center gap-2.5 rounded-control bg-surface-2 px-3 py-2 text-[0.9375rem] font-semibold">
            <Avatar name={person.name} size={28} className="ring-0" />
            {person.name}
          </p>
        )}

        <Segmented<DayKind>
          label={t("absence.dayKind")}
          value={kind}
          onChange={pickKind}
          options={[
            { value: "work", label: <><Briefcase size={16} aria-hidden />{t("absence.work")}</> },
            { value: "vacation", label: <><TreePalm size={16} aria-hidden />{t("absence.vacation")}</> },
            { value: "sick", label: <><Thermometer size={16} aria-hidden />{t("absence.sick")}</> },
          ]}
          className="flex w-full"
        />

        {leave ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("absence.from")} error={form.of("from")}>
                <Input
                  type="date"
                  value={date}
                  min={earliest}
                  max={latestLeave}
                  onChange={(e) => {
                    form.check({});
                    setDate(e.target.value);
                    if (e.target.value && to < e.target.value) setTo(e.target.value);
                  }}
                />
              </Field>
              <Field label={t("absence.to")} error={form.of("to")}>
                <Input
                  type="date"
                  value={to}
                  min={date || earliest}
                  max={latestLeave}
                  onChange={(e) => {
                    form.check({});
                    setTo(e.target.value);
                  }}
                />
              </Field>
            </div>
            {date !== to && <Toggle label={t("absence.weekdaysOnly")} hint={t("absence.weekdaysOnlyHint")} checked={weekdaysOnly} onChange={setWeekdaysOnly} />}
            {dayCount > 0 && (
              <p className="-mt-1 text-sm font-semibold">
                {fmt.range(date, to)} · {t("absence.days", { n: dayCount })}
              </p>
            )}
            <p className={cx("flex items-start gap-2 rounded-control px-3 py-2.5 text-sm font-semibold", kind === "vacation" ? "bg-info-soft text-info" : "bg-warn-soft text-warn")}>
              {kind === "vacation" ? <Eye size={16} className="mt-0.5 shrink-0" aria-hidden /> : <EyeOff size={16} className="mt-0.5 shrink-0" aria-hidden />}
              {t(kind === "vacation" ? "absence.visibleVacation" : "absence.visibleSick")}
            </p>
          </>
        ) : (
          <Field label={t("worktime.date")} hint={date ? fmt.pattern(new Date(`${date}T12:00:00`), "EEEE") : undefined}>
            <Input
              type="date"
              value={date}
              max={today}
              min={earliest}
              onChange={(e) => {
                form.clear("minutes");
                setDate(e.target.value);
              }}
              required
            />
          </Field>
        )}

        {!editable && date && (
          <p className="flex items-start gap-2 rounded-control bg-warn-soft px-3 py-2.5 text-sm font-semibold text-warn">
            <Lock size={16} className="mt-0.5 shrink-0" aria-hidden />
            {t("err.worktime_locked")}
          </p>
        )}

        {!leave && (
          <>
            {existing && existing.kind !== "work" && <p className="rounded-control bg-surface-2 px-3 py-2.5 text-sm">{t("absence.replacesLeave", { kind: t(`absence.${existing.kind}`) })}</p>}
            <Field label={t("worktime.hours")} hint={t("worktime.hoursHint")} error={form.of("minutes")}>
              <span className="flex items-center gap-2">
                <IconButton label={t("worktime.less")} className="border border-line bg-surface shadow-raise" disabled={!editable} onClick={() => setMinutes((minutes ?? 0) - 30)}>
                  <Minus size={20} aria-hidden />
                </IconButton>
                <Input
                  value={hours}
                  onChange={(e) => {
                    form.clear("minutes");
                    setHours(e.target.value);
                  }}
                  inputMode="decimal"
                  placeholder="8"
                  disabled={!editable}
                  autoFocus={!initialDate && !dayKind && window.matchMedia("(min-width: 640px)").matches}
                  className="min-h-14 text-center text-2xl font-extrabold tabular-nums"
                />
                <IconButton label={t("worktime.more")} className="border border-line bg-surface shadow-raise" disabled={!editable} onClick={() => setMinutes((minutes ?? 0) + 30)}>
                  <Plus size={20} aria-hidden />
                </IconButton>
              </span>
            </Field>
            {editable && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {QUICK_HOURS.map((h) => (
                  <Chip key={h} active={minutes === h * 60} onClick={() => setMinutes(h * 60)}>
                    {h} h
                  </Chip>
                ))}
              </div>
            )}
          </>
        )}

        <Field label={t("worktime.note")} hint={leave ? t("absence.noteHint") : undefined} error={form.of("note")} action={editable ? <DictateButton onText={(text) => setNote((p) => appendText(p, text))} /> : undefined}>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300} placeholder={t(leave ? "absence.notePlaceholder" : "worktime.notePlaceholder")} disabled={!editable} className="min-h-16" />
        </Field>

        {!leave && (
          <Group label={t("worktime.tickets")} action={ticketMinutes > 0 ? <span className="text-sm font-semibold text-muted">{fmt.minutes(ticketMinutes)}</span> : undefined}>
            {dayQuery.isPending ? (
              <Spinner className="size-5" />
            ) : (
              <>
                {onTickets.length > 0 && (
                  <ul className="mb-2 divide-y divide-line overflow-hidden rounded-control border border-line">
                    {onTickets.map((x) => (
                      <li key={x.ticketId}>
                        <button type="button" onClick={() => openTicket(x.ticketId)} className="flex min-h-11 w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{x.ticketTitle}</span>
                            <span className="block text-xs tabular-nums text-muted">{x.ticketKey}</span>
                          </span>
                          <span className="shrink-0 text-sm font-bold tabular-nums">{fmt.minutes(x.minutes)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!onTickets.length && <p className="mb-2 text-sm text-muted">{t(self ? "worktime.ticketsNone" : "worktime.ticketsNoneOther")}</p>}
                {self && editable && !picked && (
                  <Button size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => setPicking(true)}>
                    {t("worktime.addTicketTime")}
                  </Button>
                )}
                {picked && (
                  <div className="grid grid-cols-1 gap-2 rounded-control border border-line bg-surface-2 p-2.5">
                    <p className="truncate text-sm font-semibold">
                      <span className="tabular-nums text-muted">{picked.key}</span> {picked.title}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={ticketHours}
                        onChange={(e) => setTicketHours(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addTicketTime();
                          }
                        }}
                        inputMode="decimal"
                        placeholder={t("ticket.hoursPlaceholder")}
                        aria-label={t("ticket.hours")}
                        autoFocus
                      />
                      <Button variant="soft" disabled={!ticketMin} onClick={addTicketTime}>
                        {t("common.add")}
                      </Button>
                      <Button variant="ghost" onClick={() => setTicketId(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
                {self && <p className="mt-2 text-xs text-muted">{t("worktime.ticketsHint")}</p>}
              </>
            )}
          </Group>
        )}

        {existing?.updatedBy && existing.updatedBy !== userId && (
          <p className="text-xs text-muted">{t("worktime.correctedBy", { name: member(existing.updatedBy)?.name ?? "—", when: fmt.dateTime(existing.updatedAt) })}</p>
        )}
      </div>
      {!ready && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      <PickerModal open={picking} onClose={() => setPicking(false)} title={t("worktime.addTicketTime")} items={candidates} selected={[]} multiple={false} onChange={([id]) => setTicketId(id ?? null)} emptyText={t("worktime.noTicketsToPick")} />
    </Modal>
  );
}
