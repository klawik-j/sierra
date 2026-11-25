export const roles = ["owner", "admin", "employee"] as const;
export type Role = (typeof roles)[number];

export const ticketStatuses = ["todo", "in_progress", "blocked", "done", "cancelled"] as const;
export type TicketStatus = (typeof ticketStatuses)[number];
export const openStatuses: readonly TicketStatus[] = ["todo", "in_progress", "blocked"];
export const isOpenStatus = (s: TicketStatus) => openStatuses.includes(s);

export const priorities = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof priorities)[number];

export const assetKinds = ["machine", "building"] as const;
export type AssetKind = (typeof assetKinds)[number];

export const assetTypes = {
  machine: ["tractor", "combine", "car", "truck", "trailer", "sprayer", "seeder", "plough", "loader", "baler", "mower", "other"],
  building: ["barn", "cowshed", "pigsty", "henhouse", "warehouse", "garage", "workshop", "silo", "house", "greenhouse", "other"],
} as const satisfies Record<AssetKind, readonly string[]>;

export const assetStatuses = ["operational", "attention", "out_of_service", "retired"] as const;
export type AssetStatus = (typeof assetStatuses)[number];

export const meterKinds = ["hours", "km"] as const;
export type MeterKind = (typeof meterKinds)[number];

export const fileOwnerTypes = ["ticket", "asset", "note"] as const;
export type FileOwnerType = (typeof fileOwnerTypes)[number];

export const fileTags = ["before", "after", "other", "document"] as const;
export type FileTag = (typeof fileTags)[number];

export const contactCategories = ["mechanic", "dealer", "supplier", "vet", "agronomist", "insurer", "buyer", "contractor", "office", "neighbour", "other"] as const;
export type ContactCategory = (typeof contactCategories)[number];

export const locales = ["pl", "en"] as const;
export type Locale = (typeof locales)[number];

export const notificationTypes = ["assigned", "comment", "mention", "status", "absence"] as const;
export type NotificationType = (typeof notificationTypes)[number];

/** What a person's calendar day was: worked hours, or a day of leave. */
export const dayKinds = ["work", "vacation", "sick"] as const;
export type DayKind = (typeof dayKinds)[number];
export const absenceKinds = ["vacation", "sick"] as const;
export type AbsenceKind = (typeof absenceKinds)[number];
/** Leave can be planned ahead, but not further than this many days. */
export const ABSENCE_MAX_DAYS_AHEAD = 366;
