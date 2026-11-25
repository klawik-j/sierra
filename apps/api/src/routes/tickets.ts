import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, or, sql, type AnyColumn } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  canEditTicket,
  canViewTicket,
  canWorkOnTicket,
  checklistItemInput,
  checklistItemUpdate,
  commentInput,
  ticketCreateInput,
  ticketInput,
  timeLogInput,
  type ActivityDto,
  type Priority,
  type TicketDetailDto,
  type TicketDto,
  type TicketStatus,
} from "@sierra/shared";
import { db } from "../db/client.js";
import {
  activity,
  assets,
  categories,
  checklistItems,
  comments,
  contacts,
  files,
  organizations,
  ticketAssets,
  ticketAssignees,
  ticketContacts,
  tickets,
  timeLogs,
  users,
} from "../db/schema.js";
import { logActivity, notify } from "../lib/activity.js";
import { actorOf, allowed, pickPresent, requireCap, type OrgContext } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { loadTicket, touchTicket, type TicketRow } from "../lib/tickets.js";
import { assertAssetIds } from "./assets.js";
import { assertContactIds } from "./contacts.js";
import { fileDto } from "./files.js";
import { activeMemberIds } from "./orgs.js";

type Params = { orgId: string; id: string };
type SubParams = Params & { subId: string };

function groupBy<T extends { ticketId: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const list = map.get(item.ticketId);
    if (list) list.push(item);
    else map.set(item.ticketId, [item]);
  }
  return map;
}

/** Ticket rows -> DTOs with links and counters. `all` skips the id filter when the rows are the whole organization. */
async function toDtos(org: OrgContext, rows: TicketRow[], all = false): Promise<TicketDto[]> {
  if (!rows.length) return [];
  const orgId = org.id;
  const ids = rows.map((r) => r.id);
  const within = (col: AnyColumn) => (all ? undefined : inArray(col, ids));
  const [assigneeRows, assetRows, contactRows, commentRows, checkRows, timeRows, photoRows] = await Promise.all([
    db
      .select({ ticketId: ticketAssignees.ticketId, userId: ticketAssignees.userId })
      .from(ticketAssignees)
      .where(and(eq(ticketAssignees.orgId, orgId), within(ticketAssignees.ticketId))),
    db
      .select({ ticketId: ticketAssets.ticketId, assetId: ticketAssets.assetId })
      .from(ticketAssets)
      .innerJoin(assets, eq(assets.id, ticketAssets.assetId))
      .where(and(eq(ticketAssets.orgId, orgId), isNull(assets.deletedAt), within(ticketAssets.ticketId))),
    db
      .select({ ticketId: ticketContacts.ticketId, contactId: ticketContacts.contactId })
      .from(ticketContacts)
      .innerJoin(contacts, eq(contacts.id, ticketContacts.contactId))
      .where(and(eq(ticketContacts.orgId, orgId), isNull(contacts.deletedAt), within(ticketContacts.ticketId))),
    db
      .select({ ticketId: comments.ticketId, n: count() })
      .from(comments)
      .where(and(eq(comments.orgId, orgId), within(comments.ticketId)))
      .groupBy(comments.ticketId),
    db
      .select({ ticketId: checklistItems.ticketId, total: count(), done: sql<number>`count(*) filter (where ${checklistItems.done})`.mapWith(Number) })
      .from(checklistItems)
      .where(and(eq(checklistItems.orgId, orgId), within(checklistItems.ticketId)))
      .groupBy(checklistItems.ticketId),
    db
      .select({ ticketId: timeLogs.ticketId, minutes: sql<number>`coalesce(sum(${timeLogs.minutes}), 0)`.mapWith(Number) })
      .from(timeLogs)
      .where(and(eq(timeLogs.orgId, orgId), within(timeLogs.ticketId)))
      .groupBy(timeLogs.ticketId),
    db
      .select({ ticketId: files.ownerId, n: count() })
      .from(files)
      .where(and(eq(files.orgId, orgId), eq(files.ownerType, "ticket"), isNotNull(files.previewKey), within(files.ownerId)))
      .groupBy(files.ownerId),
  ]);
  const assignees = groupBy(assigneeRows);
  const linkedAssets = groupBy(assetRows);
  const linkedContacts = groupBy(contactRows);
  const one = <T extends { ticketId: string }>(items: T[]) => new Map(items.map((i) => [i.ticketId, i]));
  const commentsBy = one(commentRows);
  const checksBy = one(checkRows);
  const timeBy = one(timeRows);
  const photosBy = one(photoRows);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    key: `${org.ticketPrefix}-${r.number}`,
    title: r.title,
    status: r.status as TicketStatus,
    priority: r.priority as Priority,
    categoryId: r.categoryId,
    reporterId: r.reporterId,
    assigneeIds: (assignees.get(r.id) ?? []).map((a) => a.userId),
    assetIds: (linkedAssets.get(r.id) ?? []).map((a) => a.assetId),
    contactIds: (linkedContacts.get(r.id) ?? []).map((c) => c.contactId),
    dueDate: r.dueDate,
    estimateMinutes: r.estimateMinutes,
    spentMinutes: timeBy.get(r.id)?.minutes ?? 0,
    labels: r.labels,
    commentCount: commentsBy.get(r.id)?.n ?? 0,
    photoCount: photosBy.get(r.id)?.n ?? 0,
    checklistTotal: checksBy.get(r.id)?.total ?? 0,
    checklistDone: checksBy.get(r.id)?.done ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  }));
}

const activityDto = (a: typeof activity.$inferSelect): ActivityDto => ({
  id: a.id,
  entityType: a.entityType as ActivityDto["entityType"],
  entityId: a.entityId,
  entityLabel: a.entityLabel,
  actorId: a.actorId,
  action: a.action,
  data: a.data,
  createdAt: a.createdAt.toISOString(),
});

async function assertMembers(orgId: string, userIds: string[]) {
  if (!userIds.length) return;
  const active = await activeMemberIds(orgId);
  if (userIds.some((u) => !active.has(u))) throw badRequest("invalid_reference", "Unknown or inactive member");
}

async function assertCategory(orgId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.orgId, orgId)));
  if (!row) throw badRequest("invalid_reference", "Unknown category");
}

/** Ticket ids a restricted employee may see; null means "everything". */
async function visibleTicketIds(req: FastifyRequest): Promise<Set<string> | null> {
  if (allowed(req, "tickets.viewAll")) return null;
  const mine = db.select({ id: ticketAssignees.ticketId }).from(ticketAssignees).where(and(eq(ticketAssignees.orgId, req.org.id), eq(ticketAssignees.userId, req.user.id)));
  const rows = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(and(eq(tickets.orgId, req.org.id), or(eq(tickets.reporterId, req.user.id), inArray(tickets.id, mine))));
  return new Set(rows.map((r) => r.id));
}

export async function ticketRoutes(app: FastifyInstance) {
  app.get<{ Params: Params }>("/api/o/:orgId/tickets", async (req): Promise<TicketDto[]> => {
    const rows = await db
      .select()
      .from(tickets)
      .where(and(eq(tickets.orgId, req.org.id), isNull(tickets.deletedAt)))
      .orderBy(desc(tickets.createdAt));
    const dtos = await toDtos(req.org, rows, true);
    const actor = actorOf(req);
    return dtos.filter((t) => canViewTicket(actor, t));
  });

  app.get<{ Params: Params }>("/api/o/:orgId/tickets/:id", async (req): Promise<TicketDetailDto> => {
    const orgId = req.org.id;
    const { row } = await loadTicket(req, req.params.id);
    const [[dto], checklist, commentRows, logRows, fileRows, activityRows] = await Promise.all([
      toDtos(req.org, [row]),
      db
        .select()
        .from(checklistItems)
        .where(and(eq(checklistItems.orgId, orgId), eq(checklistItems.ticketId, row.id)))
        .orderBy(asc(checklistItems.position)),
      db
        .select()
        .from(comments)
        .where(and(eq(comments.orgId, orgId), eq(comments.ticketId, row.id)))
        .orderBy(asc(comments.createdAt)),
      db
        .select()
        .from(timeLogs)
        .where(and(eq(timeLogs.orgId, orgId), eq(timeLogs.ticketId, row.id)))
        .orderBy(desc(timeLogs.date), desc(timeLogs.createdAt)),
      db
        .select()
        .from(files)
        .where(and(eq(files.orgId, orgId), eq(files.ownerType, "ticket"), eq(files.ownerId, row.id)))
        .orderBy(asc(files.createdAt)),
      db
        .select()
        .from(activity)
        .where(and(eq(activity.orgId, orgId), eq(activity.entityType, "ticket"), eq(activity.entityId, row.id)))
        .orderBy(desc(activity.createdAt))
        .limit(200),
    ]);
    return {
      ...dto,
      description: row.description,
      checklist: checklist.map((c) => ({ id: c.id, text: c.text, done: c.done, position: c.position })),
      comments: commentRows.map((c) => ({ id: c.id, authorId: c.authorId, body: c.body, createdAt: c.createdAt.toISOString() })),
      timeLogs: logRows.map((l) => ({ id: l.id, userId: l.userId, minutes: l.minutes, date: l.date, note: l.note, createdAt: l.createdAt.toISOString() })),
      files: fileRows.map(fileDto),
      activity: activityRows.map(activityDto),
    };
  });

  app.post<{ Params: Params }>("/api/o/:orgId/tickets", async (req) => {
    requireCap(req, "tickets.create");
    const orgId = req.org.id;
    const actorId = req.user.id;
    const { assigneeIds, assetIds, contactIds, checklist, ...fields } = ticketCreateInput.parse(req.body);
    if (!allowed(req, "tickets.assign") && assigneeIds.some((u) => u !== actorId)) throw forbidden("You can only assign tickets to yourself");
    await Promise.all([assertMembers(orgId, assigneeIds), assertAssetIds(orgId, assetIds), assertContactIds(orgId, contactIds), assertCategory(orgId, fields.categoryId)]);

    const id = randomUUID();
    const number = await db.transaction(async (tx) => {
      // The row lock on the organization serialises numbering per tenant.
      const [seq] = await tx
        .update(organizations)
        .set({ ticketSeq: sql`${organizations.ticketSeq} + 1` })
        .where(eq(organizations.id, orgId))
        .returning({ number: organizations.ticketSeq });
      await tx.insert(tickets).values({ id, orgId, number: seq.number, ...fields, reporterId: actorId, completedAt: fields.status === "done" ? new Date() : null });
      if (assigneeIds.length) await tx.insert(ticketAssignees).values([...new Set(assigneeIds)].map((userId) => ({ orgId, ticketId: id, userId })));
      if (assetIds.length) await tx.insert(ticketAssets).values([...new Set(assetIds)].map((assetId) => ({ orgId, ticketId: id, assetId })));
      if (contactIds.length) await tx.insert(ticketContacts).values([...new Set(contactIds)].map((contactId) => ({ orgId, ticketId: id, contactId })));
      if (checklist.length) await tx.insert(checklistItems).values(checklist.map((text, position) => ({ id: randomUUID(), orgId, ticketId: id, text, position })));
      await logActivity(tx, { orgId, entityType: "ticket", entityId: id, entityLabel: `${req.org.ticketPrefix}-${seq.number} ${fields.title}`, actorId, action: "created" });
      await notify(tx, { orgId, ticketId: id, actorId, type: "assigned", userIds: assigneeIds });
      return seq.number;
    });
    return { id, key: `${req.org.ticketPrefix}-${number}` };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/tickets/:id", async (req) => {
    const orgId = req.org.id;
    const actorId = req.user.id;
    const actor = actorOf(req);
    const { row, info, key } = await loadTicket(req, req.params.id);
    const { assigneeIds, assetIds, contactIds, status, ...fields } = pickPresent(ticketInput.partial().parse(req.body), req.body);

    const definitionChanged = Object.keys(fields).length > 0 || assetIds !== undefined || contactIds !== undefined;
    if (definitionChanged && !canEditTicket(actor, info)) throw forbidden();
    const statusChanged = status !== undefined && status !== row.status;
    if (statusChanged && !canWorkOnTicket(actor, info)) throw forbidden();

    const added = assigneeIds?.filter((u) => !info.assigneeIds.includes(u)) ?? [];
    const removed = assigneeIds ? info.assigneeIds.filter((u) => !assigneeIds.includes(u)) : [];
    if (added.length || removed.length) {
      // Without the assign permission a member may only take or drop the ticket themselves.
      const onlySelf = [...added, ...removed].every((u) => u === actorId);
      if (!allowed(req, "tickets.assign") && !onlySelf) throw forbidden();
      await assertMembers(orgId, added);
    }
    await Promise.all([assetIds && assertAssetIds(orgId, assetIds), contactIds && assertContactIds(orgId, contactIds), assertCategory(orgId, fields.categoryId)]);

    const label = `${key} ${fields.title ?? row.title}`;
    const log = (tx: Parameters<typeof logActivity>[0], action: string, data?: Record<string, unknown>) =>
      logActivity(tx, { orgId, entityType: "ticket", entityId: row.id, entityLabel: label, actorId, action, data });

    await db.transaction(async (tx) => {
      const set: Partial<typeof tickets.$inferInsert> = { ...fields, updatedAt: new Date() };
      if (statusChanged) {
        set.status = status;
        set.completedAt = status === "done" ? new Date() : null;
      }
      await tx
        .update(tickets)
        .set(set)
        .where(and(eq(tickets.id, row.id), eq(tickets.orgId, orgId)));

      if (added.length) await tx.insert(ticketAssignees).values(added.map((userId) => ({ orgId, ticketId: row.id, userId })));
      if (removed.length) await tx.delete(ticketAssignees).where(and(eq(ticketAssignees.orgId, orgId), eq(ticketAssignees.ticketId, row.id), inArray(ticketAssignees.userId, removed)));
      if (assetIds) {
        await tx.delete(ticketAssets).where(and(eq(ticketAssets.orgId, orgId), eq(ticketAssets.ticketId, row.id)));
        if (assetIds.length) await tx.insert(ticketAssets).values([...new Set(assetIds)].map((assetId) => ({ orgId, ticketId: row.id, assetId })));
      }
      if (contactIds) {
        await tx.delete(ticketContacts).where(and(eq(ticketContacts.orgId, orgId), eq(ticketContacts.ticketId, row.id)));
        if (contactIds.length) await tx.insert(ticketContacts).values([...new Set(contactIds)].map((contactId) => ({ orgId, ticketId: row.id, contactId })));
      }

      if (statusChanged) {
        await log(tx, "status", { from: row.status, to: status });
        await notify(tx, { orgId, ticketId: row.id, actorId, type: "status", userIds: [row.reporterId, ...info.assigneeIds].filter((u): u is string => !!u), data: { from: row.status, to: status } });
      }
      if (added.length || removed.length) {
        await log(tx, "assigned", { added, removed });
        await notify(tx, { orgId, ticketId: row.id, actorId, type: "assigned", userIds: added });
      }
      if (fields.priority !== undefined && fields.priority !== row.priority) await log(tx, "priority", { from: row.priority, to: fields.priority });
      if (fields.dueDate !== undefined && fields.dueDate !== row.dueDate) await log(tx, "due", { from: row.dueDate, to: fields.dueDate });
      const edited = [
        ...(["title", "description", "categoryId", "estimateMinutes", "labels"] as const).filter((k) => fields[k] !== undefined && JSON.stringify(fields[k]) !== JSON.stringify(row[k])),
        ...(assetIds ? ["assets"] : []),
        ...(contactIds ? ["contacts"] : []),
      ];
      if (edited.length) await log(tx, "edited", { fields: edited });
    });
    return { ok: true };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/tickets/:id", async (req) => {
    requireCap(req, "tickets.delete");
    const { row, label } = await loadTicket(req, req.params.id);
    await db.transaction(async (tx) => {
      await tx
        .update(tickets)
        .set({ deletedAt: new Date() })
        .where(and(eq(tickets.id, row.id), eq(tickets.orgId, req.org.id)));
      await logActivity(tx, { orgId: req.org.id, entityType: "ticket", entityId: row.id, entityLabel: label, actorId: req.user.id, action: "deleted" });
    });
    return { ok: true };
  });

  // ---- Comments ---------------------------------------------------------

  app.post<{ Params: Params }>("/api/o/:orgId/tickets/:id/comments", async (req) => {
    const orgId = req.org.id;
    const actorId = req.user.id;
    const { row, info, label } = await loadTicket(req, req.params.id);
    const body = commentInput.parse(req.body);
    const members = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...(await activeMemberIds(orgId))]));
    const mentioned = members.filter((m) => body.body.includes(`@${m.name}`)).map((m) => m.id);
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(comments).values({ id, orgId, ticketId: row.id, authorId: actorId, body: body.body });
      await touchTicket(tx, orgId, row.id);
      await logActivity(tx, { orgId, entityType: "ticket", entityId: row.id, entityLabel: label, actorId, action: "commented" });
      await notify(tx, { orgId, ticketId: row.id, actorId, type: "mention", userIds: mentioned });
      const involved = [row.reporterId, ...info.assigneeIds].filter((u): u is string => !!u && !mentioned.includes(u));
      await notify(tx, { orgId, ticketId: row.id, actorId, type: "comment", userIds: involved });
    });
    return { id };
  });

  app.delete<{ Params: SubParams }>("/api/o/:orgId/tickets/:id/comments/:subId", async (req) => {
    const orgId = req.org.id;
    const { row } = await loadTicket(req, req.params.id);
    const [comment] = await db
      .select()
      .from(comments)
      .where(and(eq(comments.orgId, orgId), eq(comments.ticketId, row.id), eq(comments.id, req.params.subId)));
    if (!comment) throw notFound("Comment");
    if (comment.authorId !== req.user.id && !allowed(req, "tickets.editAny")) throw forbidden();
    await db.delete(comments).where(and(eq(comments.orgId, orgId), eq(comments.id, comment.id)));
    return { ok: true };
  });

  // ---- Checklist --------------------------------------------------------

  app.post<{ Params: Params }>("/api/o/:orgId/tickets/:id/checklist", async (req) => {
    const orgId = req.org.id;
    const { row, info } = await loadTicket(req, req.params.id);
    if (!canWorkOnTicket(actorOf(req), info)) throw forbidden();
    const body = checklistItemInput.parse(req.body);
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${checklistItems.position}), -1) + 1`.mapWith(Number) })
      .from(checklistItems)
      .where(and(eq(checklistItems.orgId, orgId), eq(checklistItems.ticketId, row.id)));
    const id = randomUUID();
    await db.insert(checklistItems).values({ id, orgId, ticketId: row.id, text: body.text, position: next });
    await touchTicket(db, orgId, row.id);
    return { id };
  });

  app.patch<{ Params: SubParams }>("/api/o/:orgId/tickets/:id/checklist/:subId", async (req) => {
    const orgId = req.org.id;
    const { row, info } = await loadTicket(req, req.params.id);
    if (!canWorkOnTicket(actorOf(req), info)) throw forbidden();
    const patch = pickPresent(checklistItemUpdate.partial().parse(req.body), req.body);
    if (!Object.keys(patch).length) return { ok: true };
    const rows = await db
      .update(checklistItems)
      .set(patch)
      .where(and(eq(checklistItems.orgId, orgId), eq(checklistItems.ticketId, row.id), eq(checklistItems.id, req.params.subId)))
      .returning({ id: checklistItems.id });
    if (!rows.length) throw notFound("Checklist item");
    await touchTicket(db, orgId, row.id);
    return { ok: true };
  });

  app.delete<{ Params: SubParams }>("/api/o/:orgId/tickets/:id/checklist/:subId", async (req) => {
    const orgId = req.org.id;
    const { row, info } = await loadTicket(req, req.params.id);
    if (!canWorkOnTicket(actorOf(req), info)) throw forbidden();
    await db.delete(checklistItems).where(and(eq(checklistItems.orgId, orgId), eq(checklistItems.ticketId, row.id), eq(checklistItems.id, req.params.subId)));
    return { ok: true };
  });

  // ---- Time logs --------------------------------------------------------

  app.post<{ Params: Params }>("/api/o/:orgId/tickets/:id/time", async (req) => {
    const orgId = req.org.id;
    const { row, info, label } = await loadTicket(req, req.params.id);
    if (!canWorkOnTicket(actorOf(req), info)) throw forbidden();
    const body = timeLogInput.parse(req.body);
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(timeLogs).values({ id, orgId, ticketId: row.id, userId: req.user.id, ...body });
      await touchTicket(tx, orgId, row.id);
      await logActivity(tx, { orgId, entityType: "ticket", entityId: row.id, entityLabel: label, actorId: req.user.id, action: "time", data: { minutes: body.minutes } });
    });
    return { id };
  });

  app.delete<{ Params: SubParams }>("/api/o/:orgId/tickets/:id/time/:subId", async (req) => {
    const orgId = req.org.id;
    const { row } = await loadTicket(req, req.params.id);
    const [entry] = await db
      .select()
      .from(timeLogs)
      .where(and(eq(timeLogs.orgId, orgId), eq(timeLogs.ticketId, row.id), eq(timeLogs.id, req.params.subId)));
    if (!entry) throw notFound("Time log");
    if (entry.userId !== req.user.id && !allowed(req, "tickets.editAny")) throw forbidden();
    await db.delete(timeLogs).where(and(eq(timeLogs.orgId, orgId), eq(timeLogs.id, entry.id)));
    return { ok: true };
  });

  // ---- Activity feed ----------------------------------------------------

  app.get<{ Params: Params; Querystring: { limit?: string; assetId?: string } }>("/api/o/:orgId/activity", async (req): Promise<ActivityDto[]> => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const visible = await visibleTicketIds(req);
    const rows = await db
      .select()
      .from(activity)
      .where(and(eq(activity.orgId, req.org.id), req.query.assetId ? and(eq(activity.entityType, "asset"), eq(activity.entityId, req.query.assetId)) : undefined))
      .orderBy(desc(activity.createdAt))
      .limit(visible ? 500 : limit);
    return rows
      .filter((a) => a.entityType !== "ticket" || !visible || visible.has(a.entityId))
      .slice(0, limit)
      .map(activityDto);
  });
}
