import { and, eq, gte, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  ABSENCE_MAX_DAYS_AHEAD,
  absenceInput,
  can,
  canEditWorkDay,
  workDayInput,
  type AbsenceKind,
  type AbsenceResultDto,
  type DayKind,
  type Role,
  type WorkTimeDto,
} from "@sierra/shared";
import { db } from "../db/client.js";
import { memberships, tickets, timeLogs, workDays } from "../db/schema.js";
import { notify } from "../lib/activity.js";
import { actorOf, allowed } from "../lib/context.js";
import { badRequest, HttpError, notFound } from "../lib/errors.js";

type DayParams = { orgId: string; userId: string; date: string };
const MAX_RANGE_DAYS = 400;

const isDay = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Calendar day on the server's clock, shifted by `offset` days. */
function localDay(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Every day from `from` to `to` inclusive, optionally without Saturdays and Sundays. */
function daysBetween(from: string, to: string, weekdaysOnly: boolean) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 864e5) {
    const weekday = new Date(t).getUTCDay();
    if (!weekdaysOnly || (weekday !== 0 && weekday !== 6)) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/**
 * May the caller write this person's record for these days?
 * Hours can only be recorded up to today; leave may be planned ahead.
 */
async function assertEditable(req: FastifyRequest, userId: string, from: string, to: string, kind: DayKind) {
  // Members who are not managers only ever reach their own record.
  if (userId !== req.user.id && !allowed(req, "worktime.manage")) throw notFound("Work day");
  if (kind === "work") {
    // One day of tolerance for clients ahead of the server's time zone.
    if (to > localDay(1)) throw badRequest("future_date", "Hours cannot be recorded for a future day");
  } else if (to > localDay(ABSENCE_MAX_DAYS_AHEAD)) {
    throw badRequest("too_far_ahead", "Leave can be planned at most a year ahead");
  }
  if (!canEditWorkDay(actorOf(req), userId, from, localDay())) throw new HttpError(403, "worktime_locked", "This day is closed; ask an owner or admin to correct it");
  // Former members stay correctable: their past months still matter for payroll.
  const [member] = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, req.org.id), eq(memberships.userId, userId)));
  if (!member) throw notFound("Member");
}

/** Tells owners and admins that someone will be away (and the person, when a manager entered it for them). */
async function notifyAbsence(req: FastifyRequest, userId: string, kind: AbsenceKind, days: string[]) {
  if (!days.length) return;
  const members = await db
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, req.org.id), eq(memberships.active, true)));
  const managers = members.filter((m) => can(m.role as Role, "worktime.manage", req.org.settings)).map((m) => m.userId);
  await notify(db, {
    orgId: req.org.id,
    actorId: req.user.id,
    type: "absence",
    userIds: [...managers, userId],
    data: { kind, userId, from: days[0], to: days[days.length - 1], days: days.length },
  });
}

export async function workTimeRoutes(app: FastifyInstance) {
  /**
   * Daily records plus per-ticket time for a date range. Members without `worktime.manage` only get their own.
   * `absences` covers the whole team: everyone's vacation; sick leave only for managers and the person themselves.
   */
  app.get<{ Params: { orgId: string }; Querystring: { from?: string; to?: string; userId?: string } }>("/api/o/:orgId/worktime", async (req): Promise<WorkTimeDto> => {
    const { from, to } = req.query;
    if (!isDay(from) || !isDay(to) || from > to) throw badRequest("validation", "from/to: invalid range");
    if ((Date.parse(to) - Date.parse(from)) / 864e5 > MAX_RANGE_DAYS) throw badRequest("validation", "from/to: range too long");
    const orgId = req.org.id;
    const manage = allowed(req, "worktime.manage");
    const userId = manage ? req.query.userId : req.user.id;

    const [days, ticketTime, absences] = await Promise.all([
      db
        .select()
        .from(workDays)
        .where(and(eq(workDays.orgId, orgId), gte(workDays.date, from), lte(workDays.date, to), userId ? eq(workDays.userId, userId) : undefined))
        .orderBy(workDays.date),
      db
        .select({
          userId: timeLogs.userId,
          date: timeLogs.date,
          ticketId: tickets.id,
          number: tickets.number,
          title: tickets.title,
          minutes: sql<number>`sum(${timeLogs.minutes})`.mapWith(Number),
        })
        .from(timeLogs)
        .innerJoin(tickets, eq(tickets.id, timeLogs.ticketId))
        .where(and(eq(timeLogs.orgId, orgId), isNotNull(timeLogs.userId), isNull(tickets.deletedAt), gte(timeLogs.date, from), lte(timeLogs.date, to), userId ? eq(timeLogs.userId, userId) : undefined))
        .groupBy(timeLogs.userId, timeLogs.date, tickets.id, tickets.number, tickets.title)
        .orderBy(timeLogs.date, tickets.number),
      db
        .select({ userId: workDays.userId, date: workDays.date, kind: workDays.kind })
        .from(workDays)
        .where(and(eq(workDays.orgId, orgId), gte(workDays.date, from), lte(workDays.date, to), ne(workDays.kind, "work"), manage ? undefined : or(eq(workDays.kind, "vacation"), eq(workDays.userId, req.user.id))))
        .orderBy(workDays.date),
    ]);
    return {
      days: days.map((d) => ({ userId: d.userId, date: d.date, kind: d.kind as DayKind, minutes: d.minutes, note: d.note, updatedBy: d.updatedBy, updatedAt: d.updatedAt.toISOString() })),
      ticketTime: ticketTime.map((t) => ({ userId: t.userId!, date: t.date, ticketId: t.ticketId, ticketKey: `${req.org.ticketPrefix}-${t.number}`, ticketTitle: t.title, minutes: t.minutes })),
      absences: absences.map((a) => ({ ...a, kind: a.kind as AbsenceKind })),
    };
  });

  /** One day, set explicitly: replaces whatever was recorded for it. */
  app.put<{ Params: DayParams }>("/api/o/:orgId/worktime/:userId/:date", async (req) => {
    const { userId, date } = req.params;
    if (!isDay(date)) throw badRequest("validation", "date: invalid");
    const body = workDayInput.parse(req.body);
    await assertEditable(req, userId, date, date, body.kind);
    const key = and(eq(workDays.orgId, req.org.id), eq(workDays.userId, userId), eq(workDays.date, date));
    const [before] = await db.select({ kind: workDays.kind }).from(workDays).where(key);
    await db
      .insert(workDays)
      .values({ orgId: req.org.id, userId, date, ...body, updatedBy: req.user.id })
      .onConflictDoUpdate({ target: [workDays.orgId, workDays.userId, workDays.date], set: { ...body, updatedBy: req.user.id, updatedAt: new Date() } });
    if (body.kind !== "work" && before?.kind !== body.kind) await notifyAbsence(req, userId, body.kind, [date]);
    return { ok: true };
  });

  app.delete<{ Params: DayParams }>("/api/o/:orgId/worktime/:userId/:date", async (req) => {
    const { userId, date } = req.params;
    if (!isDay(date)) throw badRequest("validation", "date: invalid");
    const key = and(eq(workDays.orgId, req.org.id), eq(workDays.userId, userId), eq(workDays.date, date));
    const [existing] = await db.select({ kind: workDays.kind }).from(workDays).where(key);
    await assertEditable(req, userId, date, date, (existing?.kind as DayKind | undefined) ?? "work");
    await db.delete(workDays).where(key);
    return { ok: true };
  });

  /**
   * Vacation or sick leave over a range of days. Days that already have hours recorded are left alone and
   * reported back, so a range can never silently wipe someone's worked time.
   */
  app.post<{ Params: { orgId: string } }>("/api/o/:orgId/absences", async (req): Promise<AbsenceResultDto> => {
    const body = absenceInput.parse(req.body);
    if (!isDay(body.from) || !isDay(body.to) || body.from > body.to) throw badRequest("validation", "from/to: invalid range");
    await assertEditable(req, body.userId, body.from, body.to, body.kind);
    const wanted = daysBetween(body.from, body.to, body.weekdaysOnly);
    if (!wanted.length) throw badRequest("no_days", "The range contains no working days");
    const orgId = req.org.id;
    const existing = await db
      .select({ date: workDays.date, kind: workDays.kind })
      .from(workDays)
      .where(and(eq(workDays.orgId, orgId), eq(workDays.userId, body.userId), gte(workDays.date, body.from), lte(workDays.date, body.to)));
    const worked = new Set(existing.filter((d) => d.kind === "work").map((d) => d.date));
    const saved = wanted.filter((d) => !worked.has(d));
    if (saved.length) {
      const row = { orgId, userId: body.userId, kind: body.kind, minutes: 0, note: body.note, updatedBy: req.user.id };
      await db
        .insert(workDays)
        .values(saved.map((date) => ({ ...row, date })))
        .onConflictDoUpdate({ target: [workDays.orgId, workDays.userId, workDays.date], set: { kind: body.kind, minutes: 0, note: body.note, updatedBy: req.user.id, updatedAt: new Date() } });
      await notifyAbsence(req, body.userId, body.kind, saved);
    }
    return { saved, skipped: wanted.filter((d) => worked.has(d)) };
  });

  /** Cancels leave in a range; recorded working hours are never touched. */
  app.delete<{ Params: { orgId: string }; Querystring: { userId?: string; from?: string; to?: string } }>("/api/o/:orgId/absences", async (req) => {
    const { userId, from, to } = req.query;
    if (!userId || !isDay(from) || !isDay(to) || from > to) throw badRequest("validation", "userId/from/to: invalid");
    await assertEditable(req, userId, from, to, "vacation");
    const rows = await db
      .delete(workDays)
      .where(and(eq(workDays.orgId, req.org.id), eq(workDays.userId, userId), gte(workDays.date, from), lte(workDays.date, to), ne(workDays.kind, "work")))
      .returning({ date: workDays.date });
    return { removed: rows.length };
  });
}
