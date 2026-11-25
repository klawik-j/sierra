import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList, Columns3, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { canWorkOnTicket, isOpenStatus, priorities, type AssetDto, type TicketDto, type TicketStatus } from "@sierra/shared";
import { AvatarStack, CategoryTag, DueBadge, PriorityMark, statusMeta } from "../components/domain";
import { Button, Chip, cx, EmptyState, Input, Modal, PageHeader, PageLoader, Segmented, Select } from "../components/ui";
import { TicketLink, useForms } from "../features/forms";
import { smartSort, TicketCounters, TicketList } from "../features/TicketRow";
import { dueState } from "../lib/format";
import { useT } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { useAct, useAssets, useOrgApi, useTickets } from "../lib/queries";

type Scope = "open" | "mine" | "all";
type View = "list" | "board";
type Sort = "smart" | "newest" | "updated" | "priority";
const VIEW_KEY = "sierra.ticketsView";
const DONE_DAYS = 14;
const BOARD: TicketStatus[] = ["todo", "in_progress", "blocked", "done"];
const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

export function TicketsPage() {
  const t = useT();
  const { can, user, activeMembers, categories } = useOrg();
  const forms = useForms();
  const tickets = useTickets();
  const assets = useAssets();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const view = (params.get("view") ?? localStorage.getItem(VIEW_KEY) ?? "list") as View;
  const scope = (params.get("scope") ?? "open") as Scope;
  const sort = (params.get("sort") ?? "smart") as Sort;
  const q = params.get("q") ?? "";
  const filters = { assignee: params.get("assignee") ?? "", priority: params.get("priority") ?? "", category: params.get("category") ?? "", asset: params.get("asset") ?? "", due: params.get("due") ?? "" };
  const activeFilters = Object.values(filters).filter(Boolean).length;
  const sheetFilters = activeFilters - (filters.due ? 1 : 0);

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === "view") localStorage.setItem(VIEW_KEY, value);
    setParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    for (const k of Object.keys(filters)) next.delete(k);
    setParams(next, { replace: true });
  };

  const assetMap = useMemo(() => new Map((assets.data ?? []).map((a) => [a.id, a])), [assets.data]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (tickets.data ?? []).filter((x) => {
      // The board always shows its "done" column; lists follow the scope.
      if (scope === "open" && view === "list" && !isOpenStatus(x.status)) return false;
      if (scope === "open" && view === "board" && x.status === "cancelled") return false;
      if (scope === "mine" && !(x.assigneeIds.includes(user.id) && (view === "board" ? x.status !== "cancelled" : isOpenStatus(x.status)))) return false;
      // Keep the board's "done" column short: only recently finished work unless everything is requested.
      if (view === "board" && scope !== "all" && x.status === "done" && x.completedAt && Date.now() - Date.parse(x.completedAt) > DONE_DAYS * 864e5) return false;
      if (filters.assignee === "none" ? x.assigneeIds.length > 0 : filters.assignee && !x.assigneeIds.includes(filters.assignee)) return false;
      if (filters.priority && x.priority !== filters.priority) return false;
      if (filters.category && x.categoryId !== filters.category) return false;
      if (filters.asset && !x.assetIds.includes(filters.asset)) return false;
      if (filters.due === "overdue" && !(x.dueDate && isOpenStatus(x.status) && dueState(x.dueDate).state === "overdue")) return false;
      if (needle && !`${x.key} ${x.title} ${x.labels.join(" ")} ${x.assetIds.map((id) => assetMap.get(id)?.name ?? "").join(" ")}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const sorters: Record<Sort, (a: TicketDto, b: TicketDto) => number> = {
      smart: smartSort,
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
      updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
      priority: (a, b) => priorityRank[a.priority] - priorityRank[b.priority] || smartSort(a, b),
    };
    return list.sort(sorters[sort]);
  }, [tickets.data, scope, view, sort, q, filters.assignee, filters.priority, filters.category, filters.asset, filters.due, user.id, assetMap]);

  const filterFields = (
    <>
      <Select value={filters.assignee} onChange={(e) => set("assignee", e.target.value)} aria-label={t("ticket.assignees")}>
        <option value="">{t("tickets.filter.anyAssignee")}</option>
        <option value="none">{t("ticket.unassigned")}</option>
        {activeMembers.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.name}
          </option>
        ))}
      </Select>
      <Select value={filters.priority} onChange={(e) => set("priority", e.target.value)} aria-label={t("ticket.priority")}>
        <option value="">{t("tickets.filter.anyPriority")}</option>
        {priorities.map((p) => (
          <option key={p} value={p}>
            {t(`priority.${p}`)}
          </option>
        ))}
      </Select>
      <Select value={filters.category} onChange={(e) => set("category", e.target.value)} aria-label={t("ticket.category")}>
        <option value="">{t("tickets.filter.anyCategory")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      <Select value={filters.asset} onChange={(e) => set("asset", e.target.value)} aria-label={t("ticket.assets")}>
        <option value="">{t("tickets.filter.anyAsset")}</option>
        {(assets.data ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
    </>
  );

  return (
    <>
      <PageHeader
        title={t("nav.tickets")}
        subtitle={tickets.data ? t("tickets.count", { n: shown.length }) : undefined}
        actions={
          can("tickets.create") && (
            <Button variant="primary" icon={<Plus size={19} strokeWidth={2.5} aria-hidden />} onClick={() => forms.open({ kind: "ticket" })} className="hidden lg:inline-flex">
              {t("ticket.new")}
            </Button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label={t("tickets.scope")}
            value={scope}
            onChange={(v) => set("scope", v === "open" ? "" : v)}
            options={[
              { value: "open", label: t("tickets.scope.open") },
              { value: "mine", label: t("tickets.scope.mine") },
              { value: "all", label: t("tickets.scope.all") },
            ]}
            className="flex-1 sm:flex-none"
          />
          <Chip active={filters.due === "overdue"} onClick={() => set("due", filters.due ? "" : "overdue")}>
            <AlertTriangle size={15} aria-hidden />
            {t("tickets.filter.overdue")}
          </Chip>
          <Segmented
            label={t("tickets.view")}
            value={view}
            onChange={(v) => set("view", v)}
            options={[
              { value: "list", label: <><List size={17} aria-hidden /><span className="hidden sm:inline">{t("tickets.view.list")}</span></> },
              { value: "board", label: <><Columns3 size={17} aria-hidden /><span className="hidden sm:inline">{t("tickets.view.board")}</span></> },
            ]}
            className="ml-auto"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 xl:max-w-xs">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={q} onChange={(e) => set("q", e.target.value)} placeholder={t("tickets.searchPlaceholder")} aria-label={t("common.search")} className="pl-10" />
          </div>
          {/* Wide screens: filters inline. Otherwise: one button that opens them in a sheet. */}
          <div className="hidden min-w-0 flex-1 grid-cols-4 gap-2 xl:grid">{filterFields}</div>
          {view === "list" && (
            <Select value={sort} onChange={(e) => set("sort", e.target.value === "smart" ? "" : e.target.value)} aria-label={t("tickets.sort")} className="hidden w-44 shrink-0 sm:block">
              {(["smart", "newest", "updated", "priority"] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`tickets.sort.${s}`)}
                </option>
              ))}
            </Select>
          )}
          <Button icon={<SlidersHorizontal size={18} aria-hidden />} onClick={() => setFiltersOpen(true)} className="xl:hidden" aria-label={t("tickets.filters")}>
            <span className="hidden sm:inline">{t("tickets.filters")}</span>
            {sheetFilters > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-on-primary">{sheetFilters}</span>}
          </Button>
          {activeFilters > 0 && (
            <Button variant="ghost" icon={<X size={17} aria-hidden />} onClick={clearFilters} className="hidden xl:inline-flex">
              {t("tickets.clearFilters")}
            </Button>
          )}
        </div>
      </div>

      {tickets.isPending ? (
        <PageLoader />
      ) : view === "board" ? (
        <Board tickets={shown} assets={assetMap} />
      ) : shown.length ? (
        <TicketList tickets={shown} assets={assetMap} />
      ) : (
        <EmptyState
          icon={<ClipboardList size={24} aria-hidden />}
          title={tickets.data?.length ? t("tickets.noMatch") : t("tickets.empty")}
          text={tickets.data?.length ? t("tickets.noMatchText") : t("tickets.emptyText")}
          action={
            !tickets.data?.length && can("tickets.create") ? (
              <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => forms.open({ kind: "ticket" })}>
                {t("ticket.new")}
              </Button>
            ) : activeFilters || q ? (
              <Button
                onClick={() => {
                  const next = new URLSearchParams();
                  if (params.get("view")) next.set("view", view);
                  setParams(next, { replace: true });
                }}
              >
                {t("tickets.clearFilters")}
              </Button>
            ) : undefined
          }
        />
      )}

      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t("tickets.filters")}
        footer={
          <>
            <Button variant="ghost" onClick={clearFilters} disabled={!activeFilters}>
              {t("tickets.clearFilters")}
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              {t("tickets.showResults", { n: shown.length })}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          {filterFields}
          <Select value={sort} onChange={(e) => set("sort", e.target.value === "smart" ? "" : e.target.value)} aria-label={t("tickets.sort")} className="sm:hidden">
            {(["smart", "newest", "updated", "priority"] as const).map((s) => (
              <option key={s} value={s}>
                {t("tickets.sort")}: {t(`tickets.sort.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </Modal>
    </>
  );
}

/** Kanban: drag cards between columns on desktop; swipe between columns on phones. */
function Board({ tickets, assets }: { tickets: TicketDto[]; assets: Map<string, AssetDto> }) {
  const t = useT();
  const { actor, orgId } = useOrg();
  const orgApi = useOrgApi();
  const act = useAct();
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<TicketStatus | null>(null);

  const move = (id: string, status: TicketStatus) => {
    const ticket = tickets.find((x) => x.id === id);
    if (!ticket || ticket.status === status) return;
    // Move the card at once; the refetch after the request confirms or reverts it.
    qc.setQueryData<TicketDto[]>(["org", orgId, "tickets"], (old) => old?.map((x) => (x.id === id ? { ...x, status } : x)));
    void act(() => orgApi.patch(`/tickets/${id}`, { status }));
  };

  return (
    <div className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 scrollbar-none sm:mx-0 sm:px-0 lg:snap-none">
      {BOARD.map((status) => {
        const items = tickets.filter((x) => x.status === status);
        const meta = statusMeta[status];
        return (
          <section
            key={status}
            aria-label={t(`status.${status}`)}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging) move(dragging, status);
              setDragging(null);
              setOver(null);
            }}
            className={cx("flex w-[82vw] max-w-sm shrink-0 snap-center flex-col rounded-card bg-surface-2 p-2 transition-colors duration-150 lg:w-auto lg:min-w-0 lg:max-w-none lg:flex-1", over === status && "bg-primary-soft ring-2 ring-primary/40")}
          >
            <h2 className="flex items-center gap-2 px-2 py-1.5 text-sm font-bold">
              <span className={cx("size-2.5 rounded-full", meta.dot)} aria-hidden />
              {t(`status.${status}`)}
              <span className="text-muted">{items.length}</span>
            </h2>
            <ul className="grid min-h-24 grid-cols-1 content-start gap-2">
              {items.map((ticket) => {
                const draggable = canWorkOnTicket(actor, ticket);
                return (
                  <li
                    key={ticket.id}
                    draggable={draggable}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", ticket.id);
                      setDragging(ticket.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cx("min-w-0 rounded-control", dragging === ticket.id && "opacity-40")}
                  >
                    <TicketLink ticketId={ticket.id} draggable={false} className={cx("block rounded-control border border-line bg-surface p-3 shadow-raise transition-colors duration-150 hover:border-primary", draggable && "lg:cursor-grab lg:active:cursor-grabbing")}>
                      <span className="flex items-start gap-2">
                        <span className={cx("min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug", status === "done" && "text-muted")}>{ticket.title}</span>
                        {status !== "done" && <PriorityMark priority={ticket.priority} />}
                      </span>
                      {ticket.assetIds.length > 0 && <span className="mt-1 block truncate text-xs text-muted">{ticket.assetIds.map((id) => assets.get(id)?.name).filter(Boolean).join(", ")}</span>}
                      <span className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
                        <span className="whitespace-nowrap font-semibold tabular-nums">{ticket.key}</span>
                        <CategoryTag categoryId={ticket.categoryId} />
                        <TicketCounters ticket={ticket} />
                      </span>
                      {(ticket.dueDate || ticket.assigneeIds.length > 0) && (
                        <span className="mt-2 flex min-h-6 items-center justify-between gap-2">
                          {ticket.dueDate ? <DueBadge day={ticket.dueDate} status={ticket.status} /> : <span />}
                          <AvatarStack userIds={ticket.assigneeIds} max={3} size={24} />
                        </span>
                      )}
                    </TicketLink>
                  </li>
                );
              })}
              {!items.length && <li className="flex min-h-20 items-center justify-center rounded-control border border-dashed border-line-strong/30 text-xs text-muted">{t("tickets.columnEmpty")}</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
