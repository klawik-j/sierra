import { ArrowLeft, AtSign, Check, ChevronDown, CirclePause, Clock, FileText, Hand, History, MessageSquare, Pencil, Play, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { canEditTicket, canWorkOnTicket, isOpenStatus, ticketStatuses, type MemberDto, type TicketDetailDto, type TicketStatus } from "@sierra/shared";
import { ContactButtons, ContactIcons } from "../components/ContactActions";
import { activityText, assetIcon, CategoryTag, DueBadge, PriorityMark, statusMeta } from "../components/domain";
import { AddFileButton, BeforeAfter, DocumentList } from "../components/Photos";
import { PickerModal, useMemberItems } from "../components/Pickers";
import { appendText, Avatar, Badge, Button, cx, DictateButton, EmptyState, IconButton, Input, optionClass, PageLoader, Textarea, useConfirm, useFocusTrap, useLayer } from "../components/ui";
import { parseHours, todayStr, useFmt } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useAssets, useContacts, useOrgApi, useTicket } from "../lib/queries";
import { useForms } from "./forms";

/** Side panel on desktop, full screen on phones. Driven by `?t=<id>` so it works on top of any screen. */
export function TicketDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useT();
  const query = useTicket(id);
  useLayer(true, onClose);
  const ref = useFocusTrap<HTMLDivElement>(true);
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 hidden animate-fade-in bg-scrim lg:block" onClick={onClose} aria-hidden />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={query.data ? `${query.data.key} ${query.data.title}` : t("ticket.one")} className="relative flex h-full w-full animate-drawer-in flex-col bg-bg shadow-pop outline-none lg:w-[46rem] lg:max-w-[calc(100vw-4rem)] lg:border-l lg:border-line">
        {query.data ? (
          <TicketView ticket={query.data} onClose={onClose} />
        ) : (
          <>
            <div className="flex items-center px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
              <IconButton label={t("common.back")} onClick={onClose}>
                <ArrowLeft size={22} aria-hidden />
              </IconButton>
            </div>
            {query.isError ? <div className="p-5"><EmptyState title={t("ticket.notFound")} text={t("ticket.notFoundText")} /></div> : <PageLoader />}
          </>
        )}
      </div>
    </div>
  );
}

function Block({ title, icon, count, actions, children }: { title: string; icon?: ReactNode; count?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex min-h-8 items-center gap-2">
        {icon && <span className="text-muted">{icon}</span>}
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{title}</h3>
        {count !== undefined && <span className="text-sm font-semibold text-muted">{count}</span>}
        <div className="ml-auto flex items-center gap-1.5">{actions}</div>
      </div>
      {children}
    </section>
  );
}

function TicketView({ ticket, onClose }: { ticket: TicketDetailDto; onClose: () => void }) {
  const t = useT();
  const fmt = useFmt();
  const { actor, can, member, user } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const confirm = useConfirm();
  const forms = useForms();
  const assets = useAssets();
  const contacts = useContacts();
  const composer = useRef<HTMLTextAreaElement>(null);

  const canWork = canWorkOnTicket(actor, ticket);
  const canEdit = canEditTicket(actor, ticket);
  const open = isOpenStatus(ticket.status);
  const mine = ticket.assigneeIds.includes(user.id);
  const path = `/tickets/${ticket.id}`;
  const owner = { ownerType: "ticket" as const, ownerId: ticket.id };

  const setStatus = (status: TicketStatus) => act(() => orgApi.patch(path, { status }));
  const take = () => act(() => orgApi.patch(path, { assigneeIds: [...ticket.assigneeIds, user.id] }), t("ticket.taken"));
  const remove = async () => {
    if (!(await confirm({ title: t("ticket.deleteTitle"), message: `${ticket.key} ${ticket.title}`, confirmLabel: t("common.delete"), danger: true }))) return;
    if (await act(() => orgApi.del(path), t("ticket.deleted"))) onClose();
  };

  // The one obvious next step for the current status.
  const next: { status: TicketStatus; label: string; icon: ReactNode } =
    ticket.status === "todo"
      ? { status: "in_progress", label: t("ticket.action.start"), icon: <Play size={18} aria-hidden /> }
      : ticket.status === "in_progress"
        ? { status: "done", label: t("ticket.action.done"), icon: <Check size={18} strokeWidth={3} aria-hidden /> }
        : ticket.status === "blocked"
          ? { status: "in_progress", label: t("ticket.action.resume"), icon: <Play size={18} aria-hidden /> }
          : { status: "todo", label: t("ticket.action.reopen"), icon: <RotateCcw size={18} aria-hidden /> };

  const linkedAssets = (assets.data ?? []).filter((a) => ticket.assetIds.includes(a.id));
  const linkedContacts = (contacts.data ?? []).filter((c) => ticket.contactIds.includes(c.id));
  const docs = ticket.files.filter((f) => !f.isImage);
  const reporter = member(ticket.reporterId);
  const StatusIcon = statusMeta[ticket.status].icon;
  const tone = { neutral: "bg-surface-3 text-fg", info: "bg-info-soft text-info", warn: "bg-warn-soft text-warn", primary: "bg-primary-soft text-primary-ink", muted: "bg-surface-2 text-muted" }[statusMeta[ticket.status].tone];

  return (
    <>
      <header className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-2 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <IconButton label={t("common.back")} onClick={onClose}>
          <ArrowLeft size={22} aria-hidden className="lg:hidden" />
          <X size={22} aria-hidden className="hidden lg:block" />
        </IconButton>
        <span className="min-w-0 flex-1 truncate text-sm font-bold tabular-nums text-muted">{ticket.key}</span>
        {canEdit && (
          <Button size="sm" variant="ghost" icon={<Pencil size={16} aria-hidden />} onClick={() => forms.open({ kind: "ticket", ticket })}>
            {t("common.edit")}
          </Button>
        )}
        {can("tickets.delete") && (
          <IconButton label={t("common.delete")} onClick={remove}>
            <Trash2 size={19} aria-hidden />
          </IconButton>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="grid grid-cols-1 gap-6 px-4 py-5 sm:px-6">
          <div>
            <h2 className={cx("text-xl font-extrabold leading-snug tracking-tight sm:text-2xl", ticket.status === "cancelled" && "text-muted line-through")}>{ticket.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {canWork ? (
                <span className={cx("relative inline-flex h-8 items-center gap-1.5 rounded-full pl-2.5 pr-2 text-sm font-bold", tone)}>
                  <StatusIcon size={15} aria-hidden />
                  {t(`status.${ticket.status}`)}
                  <ChevronDown size={15} aria-hidden />
                  <select aria-label={t("ticket.status")} value={ticket.status} onChange={(e) => setStatus(e.target.value as TicketStatus)} className={cx("absolute inset-0 cursor-pointer bg-surface text-base font-normal text-fg opacity-0", optionClass)}>
                    {ticketStatuses.map((s) => (
                      <option key={s} value={s}>
                        {t(`status.${s}`)}
                      </option>
                    ))}
                  </select>
                </span>
              ) : (
                <span className={cx("inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-bold", tone)}>
                  <StatusIcon size={15} aria-hidden />
                  {t(`status.${ticket.status}`)}
                </span>
              )}
              <PriorityMark priority={ticket.priority} withLabel />
              {ticket.dueDate && <DueBadge day={ticket.dueDate} status={ticket.status} />}
              <CategoryTag categoryId={ticket.categoryId} />
              {ticket.labels.map((l) => (
                <Badge key={l} tone="muted">
                  #{l}
                </Badge>
              ))}
            </div>
          </div>

          {ticket.description && <p className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{ticket.description}</p>}

          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
            <Meta label={t("ticket.assignees")}>
              {ticket.assigneeIds.length ? (
                <ul className="grid grid-cols-1 gap-1">
                  {ticket.assigneeIds.map((uid) => {
                    const m = member(uid);
                    return m ? <Person key={uid} m={m} subject={`${ticket.key} ${ticket.title}`} self={uid === user.id} /> : null;
                  })}
                </ul>
              ) : (
                <span className="text-sm text-muted">{t("ticket.unassigned")}</span>
              )}
              {!mine && open && (
                <Button size="sm" variant="soft" className="mt-2" icon={<Hand size={16} aria-hidden />} onClick={take}>
                  {t("ticket.take")}
                </Button>
              )}
            </Meta>
            <Meta label={t("ticket.time")}>
              <TimeSummary ticket={ticket} />
              <p className="mt-2 text-xs text-muted">
                {t("ticket.reportedBy", { name: reporter?.name ?? "—" })} · {fmt.dateTime(ticket.createdAt)}
              </p>
            </Meta>
          </div>

          {(linkedAssets.length > 0 || linkedContacts.length > 0) && (
            <div className="grid grid-cols-1 gap-4">
              {linkedAssets.length > 0 && (
                <Block title={t("ticket.assets")}>
                  <div className="flex flex-wrap gap-2">
                    {linkedAssets.map((a) => {
                      const Icon = assetIcon(a);
                      return (
                        <Link key={a.id} to={`/assets/${a.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold shadow-raise hover:border-primary">
                          <Icon size={17} className="text-primary-ink" aria-hidden />
                          {a.name}
                        </Link>
                      );
                    })}
                  </div>
                </Block>
              )}
              {linkedContacts.length > 0 && (
                <Block title={t("ticket.contacts")}>
                  <ul className="grid grid-cols-1 gap-2">
                    {linkedContacts.map((c) => (
                      <li key={c.id} className="rounded-card border border-line bg-surface p-3 shadow-raise">
                        <p className="text-[0.9375rem] font-bold">{c.name}</p>
                        <p className="text-sm text-muted">{[c.company, t(`contactCat.${c.category}`)].filter(Boolean).join(" · ")}</p>
                        <ContactButtons who={c} subject={`${ticket.key} ${ticket.title}`} className="mt-2.5" />
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </div>
          )}

          <Checklist ticket={ticket} canWork={canWork} />

          <Block
            title={t("photos.title")}
            actions={canWork && <AddFileButton owner={owner} tag="document" accept="application/pdf" label={t("photos.addDocument")} icon={<FileText size={16} aria-hidden />} />}
          >
            <BeforeAfter files={ticket.files} owner={owner} canEdit={canWork} />
            {docs.length > 0 && (
              <div className="mt-2.5">
                <DocumentList files={docs} canEdit={canWork} />
              </div>
            )}
          </Block>

          <TimeLogs ticket={ticket} canWork={canWork} />
          <Comments ticket={ticket} composer={composer} />

          <details className="group">
            <summary className="flex min-h-10 list-none items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted [&::-webkit-details-marker]:hidden">
              <History size={16} aria-hidden />
              {t("ticket.history")}
              <ChevronDown size={16} className="transition-transform duration-150 group-open:rotate-180" aria-hidden />
            </summary>
            <ol className="mt-1 grid grid-cols-1 gap-2.5 border-l-2 border-line pl-4">
              {ticket.activity.map((a) => (
                <li key={a.id} className="text-sm">
                  <span className="font-semibold">{member(a.actorId)?.name ?? "—"}</span>{" "}
                  <span className="text-muted">{activityText(t, a, (uid) => member(uid)?.name ?? "—", fmt.day, fmt.minutes)}</span>
                  <span className="block text-xs text-muted">{fmt.dateTime(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          </details>
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2.5 sm:px-6">
        {canWork && (
          <Button variant={open ? "primary" : "secondary"} icon={next.icon} onClick={() => setStatus(next.status)} className="min-w-0 flex-1 sm:flex-none">
            <span className="truncate">{next.label}</span>
          </Button>
        )}
        {canWork && ticket.status === "in_progress" && (
          <Button icon={<CirclePause size={18} aria-hidden />} onClick={() => setStatus("blocked")} aria-label={t("ticket.action.block")} title={t("ticket.action.block")}>
            <span className="hidden sm:inline">{t("ticket.action.block")}</span>
          </Button>
        )}
        {canWork && open && <AddFileButton owner={owner} tag={ticket.status === "todo" ? "before" : "after"} label={t(ticket.status === "todo" ? "photos.add.before" : "photos.add.after")} />}
        <Button
          variant="ghost"
          icon={<MessageSquare size={18} aria-hidden />}
          className="ml-auto"
          onClick={() => {
            composer.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            composer.current?.focus({ preventScroll: true });
          }}
          aria-label={t("ticket.comment")}
        >
          <span className="hidden sm:inline">{t("ticket.comment")}</span>
          {ticket.commentCount > 0 && <span className="text-sm text-muted">{ticket.commentCount}</span>}
        </Button>
      </footer>
    </>
  );
}

function Meta({ label: text, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-surface p-3.5">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{text}</p>
      {children}
    </div>
  );
}

function Person({ m, subject, self }: { m: MemberDto; subject: string; self: boolean }) {
  const t = useT();
  return (
    <li className="flex min-h-10 items-center gap-2">
      <Avatar name={m.name} size={30} />
      <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold">
        {m.name}
        {self && <span className="font-normal text-muted"> ({t("common.you")})</span>}
      </span>
      {!self && <ContactIcons who={{ phone: m.phone, email: m.email }} subject={subject} name={m.name} />}
    </li>
  );
}

function TimeSummary({ ticket }: { ticket: TicketDetailDto }) {
  const t = useT();
  const fmt = useFmt();
  const { estimateMinutes: estimate, spentMinutes: spent } = ticket;
  const over = estimate !== null && spent > estimate;
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className={cx("text-lg font-extrabold tabular-nums", over && "text-danger")}>{spent ? fmt.minutes(spent) : "0 h"}</span>
        <span className="text-sm text-muted">{estimate !== null ? t("ticket.ofEstimate", { time: fmt.minutes(estimate) }) : t("ticket.spent")}</span>
      </p>
      {estimate !== null && estimate > 0 && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={estimate} aria-valuenow={Math.min(spent, estimate)}>
          <div className={cx("h-full rounded-full", over ? "bg-danger" : "bg-primary")} style={{ width: `${Math.min(100, (spent / estimate) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function Checklist({ ticket, canWork }: { ticket: TicketDetailDto; canWork: boolean }) {
  const t = useT();
  const orgApi = useOrgApi();
  const act = useAct();
  const [text, setText] = useState("");
  const base = `/tickets/${ticket.id}/checklist`;
  if (!ticket.checklist.length && !canWork) return null;
  const add = async () => {
    if (!text.trim()) return;
    const value = text;
    setText("");
    await act(() => orgApi.post(base, { text: value }));
  };
  return (
    <Block title={t("ticket.checklist")} count={ticket.checklistTotal ? `${ticket.checklistDone}/${ticket.checklistTotal}` : undefined}>
      {ticket.checklistTotal > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${(ticket.checklistDone / ticket.checklistTotal) * 100}%` }} />
        </div>
      )}
      <ul className="grid grid-cols-1 gap-0.5">
        {ticket.checklist.map((item) => (
          <li key={item.id} className="group flex items-center gap-1">
            <label className={cx("flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control px-1.5", canWork && "hover:bg-surface-2")}>
              <input type="checkbox" className="peer sr-only" checked={item.done} disabled={!canWork} onChange={(e) => act(() => orgApi.patch(`${base}/${item.id}`, { done: e.target.checked }))} />
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-line-strong/60 text-transparent transition-colors duration-150 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-on-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                <Check size={15} strokeWidth={3.5} aria-hidden />
              </span>
              <span className={cx("min-w-0 break-words text-[0.9375rem]", item.done && "text-muted line-through")}>{item.text}</span>
            </label>
            {canWork && (
              <IconButton label={`${t("common.remove")}: ${item.text}`} className="size-9 opacity-60 hover:opacity-100" onClick={() => act(() => orgApi.del(`${base}/${item.id}`))}>
                <X size={16} aria-hidden />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {canWork && (
        <form
          className="mt-1.5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ticket.checklistAdd")} maxLength={300} aria-label={t("ticket.checklistAdd")} />
          <Button type="submit" icon={<Plus size={18} aria-hidden />} disabled={!text.trim()} aria-label={t("common.add")} />
        </form>
      )}
    </Block>
  );
}

function TimeLogs({ ticket, canWork }: { ticket: TicketDetailDto; canWork: boolean }) {
  const t = useT();
  const fmt = useFmt();
  const { member, user, can } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const [adding, setAdding] = useState(false);
  const [hours, setHours] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  if (!ticket.timeLogs.length && !canWork) return null;
  const minutes = parseHours(hours);
  const save = async () => {
    if (!minutes) return;
    if (await act(() => orgApi.post(`/tickets/${ticket.id}/time`, { minutes, date, note }))) {
      setHours("");
      setNote("");
      setAdding(false);
    }
  };
  return (
    <Block
      title={t("ticket.timeLog")}
      icon={<Clock size={16} aria-hidden />}
      count={ticket.spentMinutes ? fmt.minutes(ticket.spentMinutes) : undefined}
      actions={
        canWork &&
        !adding && (
          <Button size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => setAdding(true)}>
            {t("ticket.logTime")}
          </Button>
        )
      }
    >
      {adding && (
        <form
          className="mb-2 grid grid-cols-2 gap-2 rounded-card border border-line bg-surface p-3 shadow-raise"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" placeholder={t("ticket.hoursPlaceholder")} aria-label={t("ticket.hours")} autoFocus />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayStr()} aria-label={t("ticket.date")} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("ticket.timeNote")} maxLength={300} className="col-span-2" aria-label={t("ticket.timeNote")} />
          <div className="col-span-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" type="submit" variant="primary" disabled={!minutes}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      )}
      {ticket.timeLogs.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
          {ticket.timeLogs.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-1.5 pl-3.5 pr-1">
              <span className="w-20 shrink-0 text-sm font-bold tabular-nums">{fmt.minutes(l.minutes)}</span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{member(l.userId)?.name ?? "—"}</span>
                <span className="text-muted"> · {fmt.day(l.date)}</span>
                {l.note && <span className="block truncate text-muted">{l.note}</span>}
              </span>
              {l.userId === user.id || can("tickets.editAny") ? (
                <IconButton label={t("common.delete")} className="size-9" onClick={() => act(() => orgApi.del(`/tickets/${ticket.id}/time/${l.id}`))}>
                  <X size={16} aria-hidden />
                </IconButton>
              ) : (
                <span className="size-9" />
              )}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Comments({ ticket, composer }: { ticket: TicketDetailDto; composer: React.RefObject<HTMLTextAreaElement | null> }) {
  const t = useT();
  const fmt = useFmt();
  const { member, activeMembers, user, can } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const memberItems = useMemberItems();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mentioning, setMentioning] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    const ok = await act(() => orgApi.post(`/tickets/${ticket.id}/comments`, { body: text }));
    setBusy(false);
    if (ok) setText("");
  };

  // Highlight "@Full Name" of current members.
  const names = activeMembers.map((m) => `@${m.name}`).sort((a, b) => b.length - a.length);
  const render = (body: string) => {
    if (!names.length) return body;
    const pattern = new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g");
    return body.split(pattern).map((part, i) =>
      names.includes(part) ? (
        <span key={i} className="rounded-tag bg-primary-soft px-1 font-semibold text-primary-ink">
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  return (
    <Block title={t("ticket.comments")} icon={<MessageSquare size={16} aria-hidden />} count={ticket.comments.length || undefined}>
      {ticket.comments.length > 0 && (
        <ul className="mb-3 grid grid-cols-1 gap-3">
          {ticket.comments.map((c) => {
            const author = member(c.authorId);
            return (
              <li key={c.id} className="group flex gap-2.5">
                <Avatar name={author?.name ?? "?"} size={32} className="mt-0.5" />
                <div className="min-w-0 flex-1 rounded-card rounded-tl-md border border-line bg-surface px-3.5 py-2.5 shadow-raise">
                  <p className="flex items-baseline gap-2 text-sm">
                    <span className="font-bold">{author?.name ?? "—"}</span>
                    <span className="text-xs text-muted" title={fmt.dateTime(c.createdAt)}>
                      {fmt.ago(c.createdAt)}
                    </span>
                    {(c.authorId === user.id || can("tickets.editAny")) && (
                      <button type="button" onClick={() => act(() => orgApi.del(`/tickets/${ticket.id}/comments/${c.id}`))} className="ml-auto text-xs font-semibold text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100">
                        {t("common.delete")}
                      </button>
                    )}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed">{render(c.body)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="rounded-card border border-line-strong/50 bg-surface shadow-raise focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          ref={composer}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          placeholder={t("ticket.commentPlaceholder")}
          rows={2}
          aria-label={t("ticket.comment")}
          className="min-h-16 border-0 bg-transparent shadow-none focus:ring-0"
        />
        <div className="flex items-center gap-1.5 px-2 pb-2">
          <DictateButton onText={(spoken) => setText((p) => appendText(p, spoken))} />
          <button type="button" onClick={() => setMentioning(true)} className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-sm font-semibold text-muted hover:bg-surface-3 hover:text-fg" aria-label={t("ticket.mention")} title={t("ticket.mention")}>
            <AtSign size={16} aria-hidden />
          </button>
          <Button type="submit" size="sm" variant="primary" busy={busy} disabled={!text.trim()} icon={<Send size={15} aria-hidden />} className="ml-auto">
            {t("ticket.send")}
          </Button>
        </div>
      </form>
      <PickerModal
        open={mentioning}
        onClose={() => setMentioning(false)}
        title={t("ticket.mention")}
        items={memberItems.filter((m) => m.id !== user.id)}
        selected={[]}
        multiple={false}
        onChange={([id]) => {
          const m = member(id);
          if (m) setText((p) => `${p}${p && !/\s$/.test(p) ? " " : ""}@${m.name} `);
          setTimeout(() => composer.current?.focus(), 0);
        }}
      />
    </Block>
  );
}

