import { Camera, ListChecks, MessageSquare } from "lucide-react";
import type { AssetDto, TicketDto } from "@sierra/shared";
import { AvatarStack, CategoryTag, DueBadge, PriorityMark, statusMeta } from "../components/domain";
import { cx } from "../components/ui";
import { useT } from "../lib/i18n";
import { TicketLink } from "./forms";

const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;
const statusRank = { in_progress: 0, blocked: 1, todo: 2, done: 3, cancelled: 4 } as const;

/** Default order: open work first, then by deadline (overdue on top), priority, newest. */
export function smartSort(a: TicketDto, b: TicketDto) {
  const open = (t: TicketDto) => (t.status === "done" || t.status === "cancelled" ? 1 : 0);
  return (
    open(a) - open(b) ||
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
    priorityRank[a.priority] - priorityRank[b.priority] ||
    statusRank[a.status] - statusRank[b.status] ||
    b.createdAt.localeCompare(a.createdAt)
  );
}

export function TicketCounters({ ticket }: { ticket: TicketDto }) {
  return (
    <>
      {ticket.checklistTotal > 0 && (
        <span className="inline-flex items-center gap-1">
          <ListChecks size={13} aria-hidden />
          {ticket.checklistDone}/{ticket.checklistTotal}
        </span>
      )}
      {ticket.commentCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <MessageSquare size={13} aria-hidden />
          {ticket.commentCount}
        </span>
      )}
      {ticket.photoCount > 0 && (
        <span className="inline-flex items-center gap-1">
          <Camera size={13} aria-hidden />
          {ticket.photoCount}
        </span>
      )}
    </>
  );
}

/** One ticket as a list row. Compact on phones, with extra columns on wide screens. */
export function TicketRow({ ticket, assets, hideAssets }: { ticket: TicketDto; assets?: Map<string, AssetDto>; hideAssets?: boolean }) {
  const t = useT();
  const meta = statusMeta[ticket.status];
  const closed = ticket.status === "done" || ticket.status === "cancelled";
  const assetNames = hideAssets ? "" : ticket.assetIds.map((id) => assets?.get(id)?.name).filter(Boolean).join(", ");
  return (
    <TicketLink ticketId={ticket.id} className="flex min-h-16 items-center gap-3 px-3.5 py-2.5 transition-colors duration-150 hover:bg-surface-2 sm:px-4">
      <span className={cx("flex size-7 shrink-0 items-center justify-center rounded-full", { neutral: "text-line-strong", info: "text-info", warn: "text-warn", primary: "text-primary", muted: "text-muted" }[meta.tone])} title={t(`status.${ticket.status}`)}>
        <meta.icon size={21} aria-hidden />
        <span className="sr-only">{t(`status.${ticket.status}`)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("line-clamp-2 text-[0.9375rem] font-semibold leading-snug sm:line-clamp-1", closed && "text-muted", ticket.status === "cancelled" && "line-through")}>{ticket.title}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted">
          <span className="whitespace-nowrap font-semibold tabular-nums">{ticket.key}</span>
          <CategoryTag categoryId={ticket.categoryId} />
          {assetNames && <span className="max-w-full truncate">{assetNames}</span>}
          <TicketCounters ticket={ticket} />
        </span>
        {/* Phones: deadline and priority get their own line so the title keeps its width. */}
        {(ticket.dueDate || (!closed && ticket.priority !== "normal")) && (
          <span className="mt-1.5 flex items-center gap-1.5 sm:hidden">
            {ticket.dueDate && <DueBadge day={ticket.dueDate} status={ticket.status} />}
            {!closed && <PriorityMark priority={ticket.priority} />}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <span className="hidden items-center gap-1.5 sm:flex">
          {!closed && <PriorityMark priority={ticket.priority} />}
          {ticket.dueDate && <DueBadge day={ticket.dueDate} status={ticket.status} />}
        </span>
        <AvatarStack userIds={ticket.assigneeIds} max={2} size={24} />
      </span>
    </TicketLink>
  );
}

export function TicketList({ tickets, assets, hideAssets }: { tickets: TicketDto[]; assets?: Map<string, AssetDto>; hideAssets?: boolean }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-raise">
      {tickets.map((ticket) => (
        <li key={ticket.id}>
          <TicketRow ticket={ticket} assets={assets} hideAssets={hideAssets} />
        </li>
      ))}
    </ul>
  );
}
