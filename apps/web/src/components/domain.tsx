import {
  AlertTriangle,
  Ban,
  Beef,
  Bird,
  Building2,
  CalendarClock,
  Car,
  ChevronDown,
  ChevronsUp,
  Circle,
  CircleCheck,
  CircleDot,
  CirclePause,
  Cog,
  Container,
  Crown,
  Cylinder,
  Droplets,
  Equal,
  Forklift,
  HardHat,
  House,
  Leaf,
  Package,
  PiggyBank,
  Scissors,
  Shield,
  Shovel,
  Sprout,
  Thermometer,
  TreePalm,
  Tractor,
  Truck,
  Warehouse,
  Wheat,
  Wrench,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { isOpenStatus, type AbsenceKind, type ActivityDto, type AssetDto, type AssetStatus, type MemberDto, type Priority, type Role, type TicketStatus } from "@sierra/shared";
import { dueState, useFmt } from "../lib/format";
import { label, useT, type TFn } from "../lib/i18n";
import { useOrg } from "../lib/org";
import { Avatar, Badge, cx } from "./ui";

// ---- Tickets ---------------------------------------------------------------

export const statusMeta: Record<TicketStatus, { icon: LucideIcon; tone: "neutral" | "info" | "warn" | "primary" | "muted"; dot: string }> = {
  todo: { icon: Circle, tone: "neutral", dot: "bg-line-strong" },
  in_progress: { icon: CircleDot, tone: "info", dot: "bg-info" },
  blocked: { icon: CirclePause, tone: "warn", dot: "bg-warn" },
  done: { icon: CircleCheck, tone: "primary", dot: "bg-primary" },
  cancelled: { icon: Ban, tone: "muted", dot: "bg-surface-3" },
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  const t = useT();
  const meta = statusMeta[status];
  return (
    <Badge tone={meta.tone} icon={<meta.icon size={13} aria-hidden />}>
      {t(`status.${status}`)}
    </Badge>
  );
}

const priorityMeta: Record<Priority, { icon: LucideIcon; className: string }> = {
  low: { icon: ChevronDown, className: "text-muted" },
  normal: { icon: Equal, className: "text-muted" },
  high: { icon: ChevronUp, className: "text-warn" },
  urgent: { icon: ChevronsUp, className: "text-danger" },
};

/** Icon only by default (lists); with `withLabel` for detail views. Normal priority is not worth showing in lists. */
export function PriorityMark({ priority, withLabel }: { priority: Priority; withLabel?: boolean }) {
  const t = useT();
  const meta = priorityMeta[priority];
  const text = t(`priority.${priority}`);
  if (withLabel) {
    return (
      <span className={cx("inline-flex items-center gap-1 text-sm font-semibold", meta.className)}>
        <meta.icon size={16} strokeWidth={2.5} aria-hidden />
        {text}
      </span>
    );
  }
  if (priority === "normal") return null;
  return (
    <span className={cx("inline-flex shrink-0", meta.className)} title={`${t("ticket.priority")}: ${text}`}>
      <meta.icon size={17} strokeWidth={2.75} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Due date chip; red when overdue, amber when today/soon. Closed tickets show the plain date. */
export function DueBadge({ day, status }: { day: string; status?: TicketStatus }) {
  const fmt = useFmt();
  const open = status === undefined || isOpenStatus(status);
  const { state } = dueState(day);
  const tone = !open ? "muted" : state === "overdue" ? "danger" : state === "today" || state === "soon" ? "warn" : "muted";
  return (
    <Badge tone={tone} icon={state === "overdue" && open ? <AlertTriangle size={12} aria-hidden /> : <CalendarClock size={12} aria-hidden />}>
      {open ? fmt.due(day) : fmt.day(day)}
    </Badge>
  );
}

export function AvatarStack({ userIds, max = 3, size = 26 }: { userIds: string[]; max?: number; size?: number }) {
  const { member } = useOrg();
  const people = userIds.map((id) => member(id)).filter((m): m is MemberDto => !!m);
  if (!people.length) return null;
  return (
    <span className="flex shrink-0 items-center -space-x-1.5" aria-label={people.map((p) => p.name).join(", ")}>
      {people.slice(0, max).map((p) => (
        <Avatar key={p.userId} name={p.name} size={size} />
      ))}
      {people.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-surface-3 text-[0.625rem] font-bold text-muted ring-2 ring-surface" style={{ width: size, height: size }}>
          +{people.length - max}
        </span>
      )}
    </span>
  );
}

export function CategoryTag({ categoryId }: { categoryId: string | null }) {
  const { category } = useOrg();
  const c = category(categoryId);
  if (!c) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted">
      <span className="size-2 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
      <span className="truncate">{c.name}</span>
    </span>
  );
}

// ---- Assets ----------------------------------------------------------------

const assetIcons: Record<string, LucideIcon> = {
  tractor: Tractor,
  combine: Wheat,
  car: Car,
  truck: Truck,
  trailer: Container,
  sprayer: Droplets,
  seeder: Sprout,
  plough: Shovel,
  loader: Forklift,
  baler: Package,
  mower: Scissors,
  barn: Warehouse,
  cowshed: Beef,
  pigsty: PiggyBank,
  henhouse: Bird,
  warehouse: Warehouse,
  garage: Car,
  workshop: Wrench,
  silo: Cylinder,
  house: House,
  greenhouse: Leaf,
};

export const assetIcon = (asset: Pick<AssetDto, "kind" | "type">): LucideIcon => assetIcons[asset.type] ?? (asset.kind === "machine" ? Cog : Building2);

const assetStatusTone: Record<AssetStatus, "primary" | "warn" | "danger" | "muted"> = {
  operational: "primary",
  attention: "warn",
  out_of_service: "danger",
  retired: "muted",
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const t = useT();
  return <Badge tone={assetStatusTone[status]}>{t(`assetStatus.${status}`)}</Badge>;
}

/** Machine deadlines (inspection, insurance, service) that are overdue or due within `days`. */
export function assetDeadlines(asset: AssetDto, days = 30) {
  const d = asset.details;
  return (
    [
      ["inspection", d.inspectionDue],
      ["insurance", d.insuranceDue],
      ["service", d.serviceDue],
    ] as const
  )
    .filter((x): x is [(typeof x)[0], string] => !!x[1])
    .map(([kind, day]) => ({ kind, day, ...dueState(day, 14) }))
    .filter((x) => x.days <= days)
    .sort((a, b) => a.days - b.days);
}

// ---- People ----------------------------------------------------------------

const roleMeta: Record<Role, { icon: LucideIcon; tone: "primary" | "info" | "neutral" }> = {
  owner: { icon: Crown, tone: "primary" },
  admin: { icon: Shield, tone: "info" },
  employee: { icon: HardHat, tone: "neutral" },
};

export function RoleBadge({ role }: { role: Role }) {
  const t = useT();
  const meta = roleMeta[role];
  return (
    <Badge tone={meta.tone} icon={<meta.icon size={12} aria-hidden />}>
      {t(`role.${role}`)}
    </Badge>
  );
}

// ---- Activity --------------------------------------------------------------

/** Human sentence for a history entry, without the actor ("changed status: To do → Done"). */
export function activityText(t: TFn, a: ActivityDto, memberName: (id: string) => string, day: (d: string) => string, minutes: (m: number) => string): string {
  const d = a.data as Record<string, any>;
  if (a.entityType === "asset") {
    if (a.action === "created") return t("activity.assetCreated");
    if (a.action === "status") return t("activity.assetStatus", { to: label(t, "assetStatus", String(d.to)) });
    return t("activity.assetEdited");
  }
  switch (a.action) {
    case "created":
      return d.fromNote ? t("activity.createdFromNote") : t("activity.created");
    case "status":
      return t("activity.status", { from: label(t, "status", String(d.from)), to: label(t, "status", String(d.to)) });
    case "assigned": {
      const parts: string[] = [];
      if (d.added?.length) parts.push(t("activity.assignedAdded", { names: (d.added as string[]).map(memberName).join(", ") }));
      if (d.removed?.length) parts.push(t("activity.assignedRemoved", { names: (d.removed as string[]).map(memberName).join(", ") }));
      return parts.join(t("activity.join"));
    }
    case "priority":
      return t("activity.priority", { to: label(t, "priority", String(d.to)) });
    case "due":
      return d.to ? t("activity.due", { to: day(String(d.to)) }) : t("activity.dueCleared");
    case "edited":
      return t("activity.edited");
    case "commented":
      return t("activity.commented");
    case "photo":
      return d.tag === "before" ? t("activity.photoBefore") : d.tag === "after" ? t("activity.photoAfter") : t("activity.photo");
    case "file":
      return t("activity.file");
    case "time":
      return t("activity.time", { time: minutes(Number(d.minutes) || 0) });
    case "deleted":
      return t("activity.deleted");
    default:
      return a.action;
  }
}

// ---- Leave ------------------------------------------------------------------

export const absenceMeta: Record<AbsenceKind, { icon: LucideIcon; tone: "info" | "warn"; cell: string }> = {
  vacation: { icon: TreePalm, tone: "info", cell: "bg-info-soft text-info" },
  sick: { icon: Thermometer, tone: "warn", cell: "bg-warn-soft text-warn" },
};

export function AbsenceBadge({ kind }: { kind: AbsenceKind }) {
  const t = useT();
  const meta = absenceMeta[kind];
  return (
    <Badge tone={meta.tone} icon={<meta.icon size={13} aria-hidden />}>
      {t(`absence.${kind}`)}
    </Badge>
  );
}
