import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  assetContactInput,
  assetDetailsInput,
  assetInput,
  assetTypes,
  meterReadingInput,
  type AssetDetailDto,
  type AssetDto,
  type AssetKind,
  type AssetStatus,
  type MeterKind,
  type MeterReadingDto,
} from "@sierra/shared";
import { db } from "../db/client.js";
import { assetContacts, assets, contacts, files, meterReadings } from "../db/schema.js";
import { logActivity } from "../lib/activity.js";
import { allowed, pickPresent, requireCap } from "../lib/context.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { fileDto } from "./files.js";

type Params = { orgId: string; id: string };
type AssetRow = typeof assets.$inferSelect;

const toDto = (row: AssetRow, latest: Map<string, number>): AssetDto => ({
  id: row.id,
  kind: row.kind as AssetKind,
  parentId: row.parentId,
  name: row.name,
  type: row.type,
  status: row.status as AssetStatus,
  notes: row.notes,
  details: assetDetailsInput.parse(row.details),
  coverFileId: row.coverFileId,
  hours: latest.get(`${row.id}:hours`) ?? null,
  km: latest.get(`${row.id}:km`) ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** Latest reading per asset and meter kind, keyed `assetId:kind`. */
async function latestReadings(orgId: string, assetId?: string) {
  const rows = await db
    .selectDistinctOn([meterReadings.assetId, meterReadings.kind], { assetId: meterReadings.assetId, kind: meterReadings.kind, value: meterReadings.value })
    .from(meterReadings)
    .where(and(eq(meterReadings.orgId, orgId), assetId ? eq(meterReadings.assetId, assetId) : undefined))
    .orderBy(meterReadings.assetId, meterReadings.kind, desc(meterReadings.recordedAt), desc(meterReadings.createdAt));
  return new Map(rows.map((r) => [`${r.assetId}:${r.kind}`, r.value]));
}

export async function findAsset(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.orgId, orgId), isNull(assets.deletedAt)));
  if (!row) throw notFound("Asset");
  return row;
}

/** Throws unless every id is a live asset of the organization. */
export async function assertAssetIds(orgId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.orgId, orgId), inArray(assets.id, ids), isNull(assets.deletedAt)));
  if (rows.length !== new Set(ids).size) throw badRequest("invalid_reference", "Unknown machine or building");
}

function assertType(kind: AssetKind, type: string) {
  if (!(assetTypes[kind] as readonly string[]).includes(type)) throw badRequest("validation", `type: not valid for ${kind}`);
}

export async function assetRoutes(app: FastifyInstance) {
  app.get<{ Params: Params }>("/api/o/:orgId/assets", async (req): Promise<AssetDto[]> => {
    const [rows, latest] = await Promise.all([
      db
        .select()
        .from(assets)
        .where(and(eq(assets.orgId, req.org.id), isNull(assets.deletedAt)))
        .orderBy(asc(assets.name)),
      latestReadings(req.org.id),
    ]);
    return rows.map((r) => toDto(r, latest));
  });

  app.get<{ Params: Params }>("/api/o/:orgId/assets/:id", async (req): Promise<AssetDetailDto> => {
    const orgId = req.org.id;
    const row = await findAsset(orgId, req.params.id);
    const [latest, fileRows, readings, links] = await Promise.all([
      latestReadings(orgId, row.id),
      db
        .select()
        .from(files)
        .where(and(eq(files.orgId, orgId), eq(files.ownerType, "asset"), eq(files.ownerId, row.id)))
        .orderBy(asc(files.createdAt)),
      db
        .select()
        .from(meterReadings)
        .where(and(eq(meterReadings.orgId, orgId), eq(meterReadings.assetId, row.id)))
        .orderBy(desc(meterReadings.recordedAt), desc(meterReadings.createdAt))
        .limit(100),
      db
        .select({ contactId: assetContacts.contactId, role: assetContacts.role })
        .from(assetContacts)
        .innerJoin(contacts, eq(contacts.id, assetContacts.contactId))
        .where(and(eq(assetContacts.orgId, orgId), eq(assetContacts.assetId, row.id), isNull(contacts.deletedAt))),
    ]);
    return {
      ...toDto(row, latest),
      files: fileRows.map(fileDto),
      readings: readings.map((r): MeterReadingDto => ({ id: r.id, kind: r.kind as MeterKind, value: r.value, recordedAt: r.recordedAt, recordedBy: r.recordedBy, note: r.note })),
      contacts: links,
    };
  });

  app.post<{ Params: Params }>("/api/o/:orgId/assets", async (req) => {
    requireCap(req, "assets.manage");
    const body = assetInput.parse(req.body);
    assertType(body.kind, body.type);
    if (body.parentId) await findAsset(req.org.id, body.parentId);
    const id = randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({ id, orgId: req.org.id, ...body });
      await logActivity(tx, { orgId: req.org.id, entityType: "asset", entityId: id, entityLabel: body.name, actorId: req.user.id, action: "created" });
    });
    return { id };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/assets/:id", async (req) => {
    requireCap(req, "assets.manage");
    const orgId = req.org.id;
    const row = await findAsset(orgId, req.params.id);
    const patch = pickPresent(assetInput.omit({ kind: true }).partial().parse(req.body), req.body);
    if (patch.type) assertType(row.kind as AssetKind, patch.type);
    if (patch.parentId) {
      if (patch.parentId === row.id) throw badRequest("invalid_reference", "An asset cannot contain itself");
      await findAsset(orgId, patch.parentId);
    }
    await db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(assets.id, row.id), eq(assets.orgId, orgId)));
      const label = patch.name ?? row.name;
      if (patch.status && patch.status !== row.status) {
        await logActivity(tx, { orgId, entityType: "asset", entityId: row.id, entityLabel: label, actorId: req.user.id, action: "status", data: { from: row.status, to: patch.status } });
      } else {
        await logActivity(tx, { orgId, entityType: "asset", entityId: row.id, entityLabel: label, actorId: req.user.id, action: "edited" });
      }
    });
    return { ok: true };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/assets/:id", async (req) => {
    requireCap(req, "assets.manage");
    const row = await findAsset(req.org.id, req.params.id);
    await db
      .update(assets)
      .set({ deletedAt: new Date() })
      .where(and(eq(assets.id, row.id), eq(assets.orgId, req.org.id)));
    return { ok: true };
  });

  app.post<{ Params: Params; Body: { fileId?: string } }>("/api/o/:orgId/assets/:id/cover", async (req) => {
    requireCap(req, "assets.manage");
    const orgId = req.org.id;
    const row = await findAsset(orgId, req.params.id);
    const [file] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.orgId, orgId), eq(files.ownerType, "asset"), eq(files.ownerId, row.id), eq(files.id, String(req.body?.fileId))));
    if (!file) throw notFound("File");
    await db
      .update(assets)
      .set({ coverFileId: file.id })
      .where(and(eq(assets.id, row.id), eq(assets.orgId, orgId)));
    return { ok: true };
  });

  // Reading the hour meter is everyday field work, so every member may record it.
  app.post<{ Params: Params }>("/api/o/:orgId/assets/:id/readings", async (req) => {
    const row = await findAsset(req.org.id, req.params.id);
    const body = meterReadingInput.parse(req.body);
    const id = randomUUID();
    await db.insert(meterReadings).values({ id, orgId: req.org.id, assetId: row.id, ...body, recordedBy: req.user.id });
    return { id };
  });

  app.delete<{ Params: Params & { readingId: string } }>("/api/o/:orgId/assets/:id/readings/:readingId", async (req) => {
    const orgId = req.org.id;
    const [reading] = await db
      .select()
      .from(meterReadings)
      .where(and(eq(meterReadings.orgId, orgId), eq(meterReadings.assetId, req.params.id), eq(meterReadings.id, req.params.readingId)));
    if (!reading) throw notFound("Reading");
    if (reading.recordedBy !== req.user.id && !allowed(req, "assets.manage")) throw forbidden();
    await db.delete(meterReadings).where(and(eq(meterReadings.orgId, orgId), eq(meterReadings.id, reading.id)));
    return { ok: true };
  });

  app.put<{ Params: Params & { contactId: string } }>("/api/o/:orgId/assets/:id/contacts/:contactId", async (req) => {
    requireCap(req, "assets.manage");
    const orgId = req.org.id;
    const row = await findAsset(orgId, req.params.id);
    const body = assetContactInput.parse({ ...(req.body as object), contactId: req.params.contactId });
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, body.contactId), isNull(contacts.deletedAt)));
    if (!contact) throw notFound("Contact");
    await db
      .insert(assetContacts)
      .values({ orgId, assetId: row.id, contactId: contact.id, role: body.role })
      .onConflictDoUpdate({ target: [assetContacts.assetId, assetContacts.contactId], set: { role: body.role } });
    return { ok: true };
  });

  app.delete<{ Params: Params & { contactId: string } }>("/api/o/:orgId/assets/:id/contacts/:contactId", async (req) => {
    requireCap(req, "assets.manage");
    await db.delete(assetContacts).where(and(eq(assetContacts.orgId, req.org.id), eq(assetContacts.assetId, req.params.id), eq(assetContacts.contactId, req.params.contactId)));
    return { ok: true };
  });
}
