import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { AssetDetails, OrgSettings } from "@sierra/shared";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at").notNull().defaultNow();

export const users = pgTable("users", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  phone: text(),
  passwordHash: text().notNull(),
  locale: text().notNull().default("pl"),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index().on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: text().primaryKey(),
  name: text().notNull(),
  ticketPrefix: text().notNull().default("SRA"),
  ticketSeq: integer().notNull().default(0),
  address: text(),
  phone: text(),
  settings: jsonb().$type<OrgSettings>().notNull(),
  createdAt: createdAt(),
});

/** Tenant key: every organization-owned row carries it and every query filters on it. */
const orgId = () =>
  text()
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" });
const userRef = () => text().references(() => users.id, { onDelete: "set null" });

export const memberships = pgTable(
  "memberships",
  {
    orgId: orgId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index().on(t.userId)],
);

export const invitations = pgTable(
  "invitations",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    token: text().notNull().unique(),
    email: text(),
    role: text().notNull(),
    invitedBy: userRef(),
    createdAt: createdAt(),
    expiresAt: ts("expires_at").notNull(),
    acceptedAt: ts("accepted_at"),
  },
  (t) => [index().on(t.orgId)],
);

export const categories = pgTable(
  "categories",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    name: text().notNull(),
    color: text().notNull(),
    sortOrder: integer().notNull().default(0),
  },
  (t) => [index().on(t.orgId)],
);

export const assets = pgTable(
  "assets",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    kind: text().notNull(),
    parentId: text().references((): AnyPgColumn => assets.id, { onDelete: "set null" }),
    name: text().notNull(),
    type: text().notNull(),
    status: text().notNull().default("operational"),
    notes: text(),
    details: jsonb().$type<AssetDetails>().notNull(),
    coverFileId: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index().on(t.orgId, t.kind)],
);

export const meterReadings = pgTable(
  "meter_readings",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    assetId: text()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    kind: text().notNull(),
    value: doublePrecision().notNull(),
    recordedAt: text().notNull(),
    recordedBy: userRef(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.assetId)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    name: text().notNull(),
    company: text(),
    category: text().notNull().default("other"),
    phone: text(),
    phone2: text(),
    email: text(),
    address: text(),
    website: text(),
    notes: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index().on(t.orgId)],
);

export const assetContacts = pgTable(
  "asset_contacts",
  {
    orgId: orgId(),
    assetId: text()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    contactId: text()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
    role: text(),
  },
  (t) => [primaryKey({ columns: [t.assetId, t.contactId] }), index().on(t.orgId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    number: integer().notNull(),
    title: text().notNull(),
    description: text(),
    status: text().notNull().default("todo"),
    priority: text().notNull().default("normal"),
    categoryId: text().references(() => categories.id, { onDelete: "set null" }),
    reporterId: userRef(),
    dueDate: text(),
    estimateMinutes: integer(),
    labels: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    completedAt: ts("completed_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [uniqueIndex().on(t.orgId, t.number), index().on(t.orgId, t.status)],
);

const ticketRef = () =>
  text()
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" });

export const ticketAssignees = pgTable(
  "ticket_assignees",
  {
    orgId: orgId(),
    ticketId: ticketRef(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.userId] }), index().on(t.orgId), index().on(t.userId)],
);

export const ticketAssets = pgTable(
  "ticket_assets",
  {
    orgId: orgId(),
    ticketId: ticketRef(),
    assetId: text()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.assetId] }), index().on(t.orgId), index().on(t.assetId)],
);

export const ticketContacts = pgTable(
  "ticket_contacts",
  {
    orgId: orgId(),
    ticketId: ticketRef(),
    contactId: text()
      .notNull()
      .references(() => contacts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.contactId] }), index().on(t.orgId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    ticketId: ticketRef(),
    text: text().notNull(),
    done: boolean().notNull().default(false),
    position: integer().notNull().default(0),
  },
  (t) => [index().on(t.orgId, t.ticketId)],
);

export const comments = pgTable(
  "comments",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    ticketId: ticketRef(),
    authorId: userRef(),
    body: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.ticketId)],
);

export const timeLogs = pgTable(
  "time_logs",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    ticketId: ticketRef(),
    userId: userRef(),
    minutes: integer().notNull(),
    date: text().notNull(),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.ticketId)],
);

/** A person's total working time for one calendar day; at most one row per person and day. */
export const workDays = pgTable(
  "work_days",
  {
    orgId: orgId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text().notNull(),
    /** "work" (hours in `minutes`) or a day of leave: "vacation" / "sick" (minutes 0). */
    kind: text().notNull().default("work"),
    minutes: integer().notNull(),
    note: text(),
    updatedBy: userRef(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId, t.date] }), index().on(t.orgId, t.date)],
);

export const notes = pgTable(
  "notes",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    authorId: userRef(),
    title: text(),
    body: text().notNull().default(""),
    shared: boolean().notNull().default(false),
    ticketId: text().references(() => tickets.id, { onDelete: "set null" }),
    assetId: text().references(() => assets.id, { onDelete: "set null" }),
    contactId: text().references(() => contacts.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

/** Polymorphic attachment: `ownerType` + `ownerId` point at a ticket, asset or note of the same organization. */
export const files = pgTable(
  "files",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    ownerType: text().notNull(),
    ownerId: text().notNull(),
    tag: text().notNull().default("other"),
    name: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    width: integer(),
    height: integer(),
    caption: text(),
    storageKey: text().notNull(),
    previewKey: text(),
    thumbKey: text(),
    uploadedBy: userRef(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.ownerType, t.ownerId)],
);

export const activity = pgTable(
  "activity",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    entityLabel: text().notNull().default(""),
    actorId: userRef(),
    action: text().notNull(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.entityType, t.entityId), index().on(t.orgId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text().primaryKey(),
    orgId: orgId(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text().notNull(),
    ticketId: text().references(() => tickets.id, { onDelete: "cascade" }),
    actorId: userRef(),
    data: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.userId, t.createdAt)],
);
