import { z } from "zod";
import { absenceKinds, assetKinds, assetStatuses, contactCategories, dayKinds, fileTags, locales, meterKinds, priorities, roles, ticketStatuses } from "./enums";

const req = (max: number) => z.string().trim().min(1).max(max);
/** Optional text: empty string / undefined / null all normalise to null. */
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((v) => v || null);
const id = z.string().min(1).max(64);
const idList = z.array(id).max(50).default([]);
const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(200));
const password = z.string().min(8).max(200);

export const registerInput = z.object({ email, password, name: req(120), orgName: req(120) });
export const loginInput = z.object({ email, password: z.string().min(1).max(200) });
export const profileInput = z.object({ name: req(120), phone: opt(40), locale: z.enum(locales) });
export const passwordInput = z.object({ current: z.string().min(1).max(200), next: password });

export const orgSettingsInput = z.object({ employeesSeeAllTickets: z.boolean(), employeesCreateTickets: z.boolean() });
export const orgInput = z.object({
  name: req(120),
  ticketPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,5}$/),
  address: opt(300),
  phone: opt(40),
  settings: orgSettingsInput,
});
export const orgCreateInput = z.object({ name: req(120) });

export const memberCreateInput = z.object({ email, name: req(120), password, role: z.enum(roles), phone: opt(40) });
export const memberPasswordInput = z.object({ password });
export const memberUpdateInput = z.object({ role: z.enum(roles), active: z.boolean() });
export const invitationInput = z.object({ role: z.enum(roles), email: email.nullish().transform((v) => v || null) });
export const acceptInviteInput = z.object({ email, name: req(120), password });

export const categoryInput = z.object({ name: req(60), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });

export const assetDetailsInput = z.object({
  make: opt(80),
  model: opt(80),
  year: z.number().int().min(1900).max(2100).nullish().transform((v) => v ?? null),
  plate: opt(20),
  vin: opt(40),
  inspectionDue: isoDate,
  insuranceDue: isoDate,
  serviceDue: isoDate,
  address: opt(300),
  areaM2: z.number().min(0).max(1e7).nullish().transform((v) => v ?? null),
});
export const assetInput = z.object({
  kind: z.enum(assetKinds),
  name: req(120),
  type: req(40),
  status: z.enum(assetStatuses).default("operational"),
  parentId: id.nullish().transform((v) => v || null),
  notes: opt(5000),
  details: assetDetailsInput.default(() => assetDetailsInput.parse({})),
});
export const meterReadingInput = z.object({
  kind: z.enum(meterKinds),
  value: z.number().min(0).max(1e8),
  recordedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: opt(300),
});
export const assetContactInput = z.object({ contactId: id, role: opt(80) });

export const ticketInput = z.object({
  title: req(200),
  description: opt(20000),
  status: z.enum(ticketStatuses).default("todo"),
  priority: z.enum(priorities).default("normal"),
  categoryId: id.nullish().transform((v) => v || null),
  assigneeIds: idList,
  assetIds: idList,
  contactIds: idList,
  dueDate: isoDate,
  estimateMinutes: z.number().int().min(0).max(100000).nullish().transform((v) => v ?? null),
  labels: z.array(req(30)).max(10).default([]),
});
export const ticketCreateInput = ticketInput.extend({ checklist: z.array(req(300)).max(50).default([]) });
export const commentInput = z.object({ body: req(10000) });
export const checklistItemInput = z.object({ text: req(300) });
export const checklistItemUpdate = z.object({ text: req(300), done: z.boolean() });
export const timeLogInput = z.object({
  minutes: z.number().int().min(1).max(24 * 60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: opt(300),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One day: hours worked (independent of time logged on tickets), or a day of vacation / sick leave (no hours). */
export const workDayInput = z
  .object({ kind: z.enum(dayKinds).default("work"), minutes: z.number().int().min(0).max(24 * 60).default(0), note: opt(300) })
  .superRefine((value, ctx) => {
    if (value.kind === "work" && value.minutes < 1) ctx.addIssue({ code: "too_small", origin: "number", minimum: 1, inclusive: true, path: ["minutes"], message: "Hours are required for a working day" });
  })
  .transform((value) => (value.kind === "work" ? value : { ...value, minutes: 0 }));

/** Vacation or sick leave over a range of days. */
export const absenceInput = z.object({
  userId: id,
  kind: z.enum(absenceKinds),
  from: day,
  to: day,
  /** Skip Saturdays and Sundays inside the range. */
  weekdaysOnly: z.boolean().default(true),
  note: opt(300),
});

export const noteInput = z.object({
  title: opt(200),
  body: z.string().trim().max(20000).default(""),
  shared: z.boolean().default(false),
  ticketId: id.nullish().transform((v) => v || null),
  assetId: id.nullish().transform((v) => v || null),
  contactId: id.nullish().transform((v) => v || null),
});

export const contactInput = z.object({
  name: req(120),
  company: opt(120),
  category: z.enum(contactCategories).default("other"),
  phone: opt(40),
  phone2: opt(40),
  email: email.or(z.literal("")).nullish().transform((v) => v || null),
  address: opt(300),
  website: opt(300),
  notes: opt(5000),
});

export const fileUpdateInput = z.object({ tag: z.enum(fileTags), caption: opt(300) });

export type RegisterInput = z.input<typeof registerInput>;
export type OrgInput = z.input<typeof orgInput>;
export type MemberCreateInput = z.input<typeof memberCreateInput>;
export type AssetInput = z.input<typeof assetInput>;
export type AssetDetails = z.output<typeof assetDetailsInput>;
export type TicketInput = z.input<typeof ticketInput>;
export type TicketCreateInput = z.input<typeof ticketCreateInput>;
export type NoteInput = z.input<typeof noteInput>;
export type ContactInput = z.input<typeof contactInput>;
