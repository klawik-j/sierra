import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { noteInput, type NoteDto } from "@sierra/shared";
import { db } from "../db/client.js";
import { files, notes, organizations, ticketAssets, tickets } from "../db/schema.js";
import { logActivity } from "../lib/activity.js";
import { allowed, pickPresent, requireCap } from "../lib/context.js";
import { forbidden, notFound } from "../lib/errors.js";
import { loadTicket } from "../lib/tickets.js";
import { assertAssetIds } from "./assets.js";
import { assertContactIds } from "./contacts.js";
import { fileDto, removeOwnerFiles } from "./files.js";

type Params = { orgId: string; id: string };

/** A member sees their own notes plus notes shared with the farm. */
const visibleTo = (req: FastifyRequest) =>
  and(eq(notes.orgId, req.org.id), allowed(req, "notes.viewShared") ? or(eq(notes.authorId, req.user.id), eq(notes.shared, true)) : eq(notes.authorId, req.user.id));

async function findOwnNote(req: FastifyRequest, id: string) {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), visibleTo(req)));
  if (!row) throw notFound("Note");
  if (row.authorId !== req.user.id) throw forbidden();
  return row;
}

async function assertLinks(req: FastifyRequest, links: { ticketId?: string | null; assetId?: string | null; contactId?: string | null }) {
  if (links.ticketId) await loadTicket(req, links.ticketId);
  if (links.assetId) await assertAssetIds(req.org.id, [links.assetId]);
  if (links.contactId) await assertContactIds(req.org.id, [links.contactId]);
}

export async function noteRoutes(app: FastifyInstance) {
  app.get<{ Params: Params }>("/api/o/:orgId/notes", async (req): Promise<NoteDto[]> => {
    const rows = await db.select().from(notes).where(visibleTo(req)).orderBy(desc(notes.updatedAt));
    const fileRows = rows.length
      ? await db
          .select()
          .from(files)
          .where(and(eq(files.orgId, req.org.id), eq(files.ownerType, "note"), inArray(files.ownerId, rows.map((r) => r.id))))
          .orderBy(files.createdAt)
      : [];
    return rows.map((r) => ({
      id: r.id,
      authorId: r.authorId,
      title: r.title,
      body: r.body,
      shared: r.shared,
      ticketId: r.ticketId,
      assetId: r.assetId,
      contactId: r.contactId,
      files: fileRows.filter((f) => f.ownerId === r.id).map(fileDto),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });

  app.post<{ Params: Params }>("/api/o/:orgId/notes", async (req) => {
    const body = noteInput.parse(req.body);
    await assertLinks(req, body);
    const id = randomUUID();
    await db.insert(notes).values({ id, orgId: req.org.id, authorId: req.user.id, ...body });
    return { id };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/notes/:id", async (req) => {
    const row = await findOwnNote(req, req.params.id);
    const patch = pickPresent(noteInput.partial().parse(req.body), req.body);
    await assertLinks(req, patch);
    await db
      .update(notes)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(notes.id, row.id), eq(notes.orgId, req.org.id)));
    return { ok: true };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/notes/:id", async (req) => {
    const row = await findOwnNote(req, req.params.id);
    await db.delete(notes).where(and(eq(notes.id, row.id), eq(notes.orgId, req.org.id)));
    await removeOwnerFiles(req.org.id, "note", row.id);
    return { ok: true };
  });

  /** Turns a note into a ticket: the text becomes the description and its photos move over. */
  app.post<{ Params: Params }>("/api/o/:orgId/notes/:id/convert", async (req) => {
    requireCap(req, "tickets.create");
    const orgId = req.org.id;
    const note = await findOwnNote(req, req.params.id);
    const firstLine = note.body.split("\n").find((l) => l.trim())?.trim() ?? "";
    const title = (note.title || firstLine || "Note").slice(0, 200);
    const ticketId = randomUUID();
    const number = await db.transaction(async (tx) => {
      const [seq] = await tx
        .update(organizations)
        .set({ ticketSeq: sql`${organizations.ticketSeq} + 1` })
        .where(eq(organizations.id, orgId))
        .returning({ number: organizations.ticketSeq });
      await tx.insert(tickets).values({ id: ticketId, orgId, number: seq.number, title, description: note.body || null, reporterId: req.user.id });
      if (note.assetId) await tx.insert(ticketAssets).values({ orgId, ticketId, assetId: note.assetId });
      await tx
        .update(files)
        .set({ ownerType: "ticket", ownerId: ticketId })
        .where(and(eq(files.orgId, orgId), eq(files.ownerType, "note"), eq(files.ownerId, note.id)));
      await tx
        .update(notes)
        .set({ ticketId, updatedAt: new Date() })
        .where(and(eq(notes.id, note.id), eq(notes.orgId, orgId)));
      await logActivity(tx, { orgId, entityType: "ticket", entityId: ticketId, entityLabel: `${req.org.ticketPrefix}-${seq.number} ${title}`, actorId: req.user.id, action: "created", data: { fromNote: true } });
      return seq.number;
    });
    return { id: ticketId, key: `${req.org.ticketPrefix}-${number}` };
  });
}
