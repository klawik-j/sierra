import type {
  AbsenceKind,
  AssetKind,
  AssetStatus,
  ContactCategory,
  DayKind,
  FileOwnerType,
  FileTag,
  Locale,
  MeterKind,
  NotificationType,
  Priority,
  Role,
  TicketStatus,
} from "./enums";
import type { OrgSettings } from "./permissions";
import type { AssetDetails } from "./schemas";

/** API response shapes. Dates are ISO strings; calendar days are `YYYY-MM-DD`. */

export interface UserDto {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  locale: Locale;
}

export interface MembershipDto {
  orgId: string;
  orgName: string;
  role: Role;
}

export interface MeDto {
  user: UserDto;
  memberships: MembershipDto[];
}

export interface OrgDto {
  id: string;
  name: string;
  ticketPrefix: string;
  address: string | null;
  phone: string | null;
  settings: OrgSettings;
}

export interface MemberDto {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  active: boolean;
}

export interface CategoryDto {
  id: string;
  name: string;
  color: string;
}

export interface InvitationDto {
  id: string;
  token: string;
  email: string | null;
  role: Role;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationInfoDto {
  orgName: string;
  role: Role;
  email: string | null;
  invitedBy: string | null;
}

/** Reference data loaded once per organization. */
export interface BootstrapDto {
  org: OrgDto;
  role: Role;
  members: MemberDto[];
  categories: CategoryDto[];
}

export interface FileDto {
  id: string;
  ownerType: FileOwnerType;
  ownerId: string;
  tag: FileTag;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  caption: string | null;
  isImage: boolean;
  uploadedBy: string | null;
  createdAt: string;
}

export interface AssetDto {
  id: string;
  kind: AssetKind;
  parentId: string | null;
  name: string;
  type: string;
  status: AssetStatus;
  notes: string | null;
  details: AssetDetails;
  coverFileId: string | null;
  /** Latest readings, if any. */
  hours: number | null;
  km: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MeterReadingDto {
  id: string;
  kind: MeterKind;
  value: number;
  recordedAt: string;
  recordedBy: string | null;
  note: string | null;
}

export interface AssetContactDto {
  contactId: string;
  role: string | null;
}

export interface AssetDetailDto extends AssetDto {
  files: FileDto[];
  readings: MeterReadingDto[];
  contacts: AssetContactDto[];
}

export interface TicketDto {
  id: string;
  number: number;
  key: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  categoryId: string | null;
  reporterId: string | null;
  assigneeIds: string[];
  assetIds: string[];
  contactIds: string[];
  dueDate: string | null;
  estimateMinutes: number | null;
  spentMinutes: number;
  labels: string[];
  commentCount: number;
  photoCount: number;
  checklistTotal: number;
  checklistDone: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ChecklistItemDto {
  id: string;
  text: string;
  done: boolean;
  position: number;
}

export interface CommentDto {
  id: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface TimeLogDto {
  id: string;
  userId: string | null;
  minutes: number;
  date: string;
  note: string | null;
  createdAt: string;
}

export interface ActivityDto {
  id: string;
  entityType: "ticket" | "asset";
  entityId: string;
  /** Display label of the entity at the time of the event (ticket key + title, asset name). */
  entityLabel: string;
  actorId: string | null;
  action: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface TicketDetailDto extends TicketDto {
  description: string | null;
  checklist: ChecklistItemDto[];
  comments: CommentDto[];
  timeLogs: TimeLogDto[];
  files: FileDto[];
  activity: ActivityDto[];
}

/** One person's day: hours worked, or vacation / sick leave (then `minutes` is 0). */
export interface WorkDayDto {
  userId: string;
  date: string;
  kind: DayKind;
  minutes: number;
  note: string | null;
  /** Who saved it last; differs from `userId` when a manager corrected it. */
  updatedBy: string | null;
  updatedAt: string;
}

/** Time a person logged on one ticket on one day. */
export interface WorkTicketTimeDto {
  userId: string;
  date: string;
  ticketId: string;
  ticketKey: string;
  ticketTitle: string;
  minutes: number;
}

/** A day someone is away, as far as the caller may know: no note, and sick leave only for managers and the person. */
export interface AbsenceDto {
  userId: string;
  date: string;
  kind: AbsenceKind;
}

export interface WorkTimeDto {
  /** Full entries: the caller's own, or everyone's for managers. */
  days: WorkDayDto[];
  ticketTime: WorkTicketTimeDto[];
  /** Who is away in the range, across the whole team. */
  absences: AbsenceDto[];
}

export interface AbsenceResultDto {
  saved: string[];
  /** Days left untouched because hours were already recorded on them. */
  skipped: string[];
}

export interface NoteDto {
  id: string;
  authorId: string | null;
  title: string | null;
  body: string;
  shared: boolean;
  ticketId: string | null;
  assetId: string | null;
  contactId: string | null;
  files: FileDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ContactDto {
  id: string;
  name: string;
  company: string | null;
  category: ContactCategory;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  /** Assets this contact is linked to (dealer, service, insurer…). */
  assets: { assetId: string; role: string | null }[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationType;
  ticketId: string | null;
  ticketKey: string | null;
  ticketTitle: string | null;
  actorId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

/** One rejected input field, e.g. `{ path: "details.year", code: "too_small", origin: "number", minimum: 1900 }`. */
export interface ValidationIssue {
  path: string;
  code: string;
  origin?: string;
  format?: string;
  minimum?: number;
  maximum?: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
  /** Present when `error` is "validation". */
  issues?: ValidationIssue[];
}
