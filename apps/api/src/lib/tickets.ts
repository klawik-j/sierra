import { and, eq, isNull } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { canViewTicket, type TicketAccessInfo } from "@sierra/shared";
import { db, type DB, type Tx } from "../db/client.js";
import { ticketAssignees, tickets } from "../db/schema.js";
import { actorOf } from "./context.js";
import { notFound } from "./errors.js";

export type TicketRow = typeof tickets.$inferSelect;

export interface LoadedTicket {
  row: TicketRow;
  info: TicketAccessInfo & { assigneeIds: string[] };
  key: string;
  /** "SRA-12 Title" — stored with activity entries. */
  label: string;
}

/** Loads a ticket of the request's organization; 404 when it does not exist or the caller may not see it. */
export async function loadTicket(req: FastifyRequest, id: string): Promise<LoadedTicket> {
  const orgId = req.org.id;
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId), isNull(tickets.deletedAt)));
  if (!row) throw notFound("Ticket");
  const assignees = await db
    .select({ userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(and(eq(ticketAssignees.orgId, orgId), eq(ticketAssignees.ticketId, id)));
  const info = { reporterId: row.reporterId, assigneeIds: assignees.map((a) => a.userId) };
  if (!canViewTicket(actorOf(req), info)) throw notFound("Ticket");
  const key = `${req.org.ticketPrefix}-${row.number}`;
  return { row, info, key, label: `${key} ${row.title}` };
}

export async function touchTicket(conn: DB | Tx, orgId: string, id: string) {
  await conn
    .update(tickets)
    .set({ updatedAt: new Date() })
    .where(and(eq(tickets.id, id), eq(tickets.orgId, orgId)));
}
