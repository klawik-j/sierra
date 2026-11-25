import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import sharp from "sharp";
import { canWorkOnTicket, fileOwnerTypes, fileTags, fileUpdateInput, type FileDto, type FileOwnerType, type FileTag } from "@sierra/shared";
import { db } from "../db/client.js";
import { assets, files, notes } from "../db/schema.js";
import { logActivity } from "../lib/activity.js";
import { actorOf, allowed, pickPresent } from "../lib/context.js";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors.js";
import { storage } from "../lib/storage.js";
import { loadTicket, touchTicket } from "../lib/tickets.js";
import { findAsset } from "./assets.js";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// No SVG/HTML: uploads are served from the app's origin.
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];
const ALLOWED_TYPES = [...IMAGE_TYPES, "application/pdf"];

type FileRow = typeof files.$inferSelect;
type Params = { orgId: string; id: string };

// Keep image processing lean: the production instance is small.
sharp.concurrency(1);
sharp.cache(false);

export const fileDto = (r: FileRow): FileDto => ({
  id: r.id,
  ownerType: r.ownerType as FileOwnerType,
  ownerId: r.ownerId,
  tag: r.tag as FileTag,
  name: r.name,
  mime: r.mime,
  size: r.size,
  width: r.width,
  height: r.height,
  caption: r.caption,
  isImage: r.previewKey !== null,
  uploadedBy: r.uploadedBy,
  createdAt: r.createdAt.toISOString(),
});

async function removeStored(row: Pick<FileRow, "storageKey" | "previewKey" | "thumbKey">) {
  for (const key of [row.storageKey, row.previewKey, row.thumbKey]) {
    if (key) await storage.remove(key).catch(() => undefined);
  }
}

export async function removeOwnerFiles(orgId: string, ownerType: FileOwnerType, ownerId: string) {
  const rows = await db
    .delete(files)
    .where(and(eq(files.orgId, orgId), eq(files.ownerType, ownerType), eq(files.ownerId, ownerId)))
    .returning();
  for (const row of rows) await removeStored(row);
}

/**
 * A file inherits the access rules of the thing it is attached to.
 * Throws 404 when the owner is not visible to the caller, 403 when `write` is not permitted.
 */
async function checkOwnerAccess(req: FastifyRequest, ownerType: FileOwnerType, ownerId: string, write: boolean) {
  if (ownerType === "ticket") {
    const ticket = await loadTicket(req, ownerId);
    if (write && !canWorkOnTicket(actorOf(req), ticket.info)) throw forbidden();
    return { label: ticket.label };
  }
  if (ownerType === "asset") {
    const asset = await findAsset(req.org.id, ownerId);
    if (write && !allowed(req, "assets.manage")) throw forbidden();
    return { label: asset.name };
  }
  const [note] = await db
    .select({ authorId: notes.authorId, shared: notes.shared })
    .from(notes)
    .where(and(eq(notes.id, ownerId), eq(notes.orgId, req.org.id)));
  const mine = note?.authorId === req.user.id;
  if (!note || (!mine && !(note.shared && allowed(req, "notes.viewShared")))) throw notFound("Note");
  if (write && !mine) throw forbidden();
  return { label: "" };
}

async function findFile(req: FastifyRequest, id: string) {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.orgId, req.org.id)));
  if (!row) throw notFound("File");
  return row;
}

export async function fileRoutes(app: FastifyInstance) {
  app.post<{ Params: Params }>("/api/o/:orgId/files", async (req) => {
    const orgId = req.org.id;
    const part = await req.file();
    if (!part) throw badRequest("validation", "file: missing");
    const buffer = await part.toBuffer();
    const field = (name: string) => {
      const f = part.fields[name];
      const one = Array.isArray(f) ? f[0] : f;
      return one && "value" in one && typeof one.value === "string" ? one.value.trim() : "";
    };
    const ownerType = field("ownerType") as FileOwnerType;
    const ownerId = field("ownerId");
    if (!fileOwnerTypes.includes(ownerType) || !ownerId) throw badRequest("validation", "ownerType/ownerId: invalid");
    const tag = (fileTags as readonly string[]).includes(field("tag")) ? (field("tag") as FileTag) : "other";
    const { label } = await checkOwnerAccess(req, ownerType, ownerId, true);

    const name = (part.filename || "file").slice(0, 200);
    let mime = part.mimetype || "application/octet-stream";
    if (/\.(heic|heif)$/i.test(name) && !mime.startsWith("image/")) mime = "image/heic";
    if (!ALLOWED_TYPES.includes(mime)) throw new HttpError(415, "unsupported_type", "Only photos and PDF files can be uploaded");

    const id = randomUUID();
    const prefix = `${orgId}/${id}`;
    const storageKey = `${prefix}/original`;
    let previewKey: string | null = null;
    let thumbKey: string | null = null;
    let width: number | null = null;
    let height: number | null = null;

    if (IMAGE_TYPES.includes(mime)) {
      try {
        const img = sharp(buffer, { failOn: "none" }).rotate();
        const meta = await img.metadata();
        const preview = await img.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true });
        const thumb = await img.clone().resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
        width = meta.autoOrient?.width ?? meta.width ?? preview.info.width;
        height = meta.autoOrient?.height ?? meta.height ?? preview.info.height;
        await storage.put(`${prefix}/preview.jpg`, preview.data, "image/jpeg");
        await storage.put(`${prefix}/thumb.jpg`, thumb, "image/jpeg");
        previewKey = `${prefix}/preview.jpg`;
        thumbKey = `${prefix}/thumb.jpg`;
      } catch (err) {
        // Declared as an image but not decodable: refuse rather than store unknown bytes.
        req.log.warn({ err }, "image processing failed");
        throw new HttpError(415, "unsupported_type", "This image could not be read");
      }
    }
    await storage.put(storageKey, buffer, mime);

    const [row] = await db
      .insert(files)
      .values({ id, orgId, ownerType, ownerId, tag, name, mime, size: buffer.length, width, height, caption: field("caption") || null, storageKey, previewKey, thumbKey, uploadedBy: req.user.id })
      .returning();

    if (ownerType === "ticket") {
      await touchTicket(db, orgId, ownerId);
      await logActivity(db, { orgId, entityType: "ticket", entityId: ownerId, entityLabel: label, actorId: req.user.id, action: previewKey ? "photo" : "file", data: { tag } });
    } else if (ownerType === "asset" && previewKey) {
      // First photo becomes the cover.
      const asset = await findAsset(orgId, ownerId);
      if (!asset.coverFileId) {
        await db
          .update(assets)
          .set({ coverFileId: id })
          .where(and(eq(assets.id, ownerId), eq(assets.orgId, orgId)));
      }
    }
    return fileDto(row);
  });

  app.get<{ Params: Params & { variant: string } }>("/api/o/:orgId/files/:id/:variant", async (req, reply) => {
    const row = await findFile(req, req.params.id);
    await checkOwnerAccess(req, row.ownerType as FileOwnerType, row.ownerId, false);
    const variant = req.params.variant;
    const key = variant === "thumb" ? row.thumbKey : variant === "preview" ? row.previewKey : null;
    const body = await storage.get(key ?? row.storageKey);
    reply.header("Content-Type", key ? "image/jpeg" : row.mime);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Cache-Control", "private, max-age=31536000, immutable");
    if (!key) reply.header("Content-Disposition", `${variant === "download" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.name)}`);
    return reply.send(body);
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/files/:id", async (req) => {
    const row = await findFile(req, req.params.id);
    await checkOwnerAccess(req, row.ownerType as FileOwnerType, row.ownerId, true);
    const patch = pickPresent(fileUpdateInput.partial().parse(req.body), req.body);
    if (Object.keys(patch).length) {
      await db
        .update(files)
        .set(patch)
        .where(and(eq(files.id, row.id), eq(files.orgId, req.org.id)));
    }
    return { ok: true };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/files/:id", async (req) => {
    const orgId = req.org.id;
    const row = await findFile(req, req.params.id);
    await checkOwnerAccess(req, row.ownerType as FileOwnerType, row.ownerId, true);
    await db.delete(files).where(and(eq(files.id, row.id), eq(files.orgId, orgId)));
    await removeStored(row);
    if (row.ownerType === "asset") {
      const [next] = await db
        .select({ id: files.id })
        .from(files)
        .where(and(eq(files.orgId, orgId), eq(files.ownerType, "asset"), eq(files.ownerId, row.ownerId), isNotNull(files.previewKey)))
        .orderBy(asc(files.createdAt))
        .limit(1);
      await db
        .update(assets)
        .set({ coverFileId: next?.id ?? null })
        .where(and(eq(assets.id, row.ownerId), eq(assets.orgId, orgId), eq(assets.coverFileId, row.id)));
    }
    return { ok: true };
  });
}
