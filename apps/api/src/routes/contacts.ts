import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { contactInput, type ContactCategory, type ContactDto } from "@sierra/shared";
import { db } from "../db/client.js";
import { assetContacts, assets, contacts } from "../db/schema.js";
import { pickPresent, requireCap } from "../lib/context.js";
import { badRequest, notFound } from "../lib/errors.js";

type Params = { orgId: string; id: string };

/** Throws unless every id is a live contact of the organization. */
export async function assertContactIds(orgId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, ids), isNull(contacts.deletedAt)));
  if (rows.length !== new Set(ids).size) throw badRequest("invalid_reference", "Unknown contact");
}

export async function contactRoutes(app: FastifyInstance) {
  app.get<{ Params: Params }>("/api/o/:orgId/contacts", async (req): Promise<ContactDto[]> => {
    const orgId = req.org.id;
    const [rows, links] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
        .orderBy(asc(contacts.name)),
      db
        .select({ contactId: assetContacts.contactId, assetId: assetContacts.assetId, role: assetContacts.role })
        .from(assetContacts)
        .innerJoin(assets, eq(assets.id, assetContacts.assetId))
        .where(and(eq(assetContacts.orgId, orgId), isNull(assets.deletedAt))),
    ]);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      company: r.company,
      category: r.category as ContactCategory,
      phone: r.phone,
      phone2: r.phone2,
      email: r.email,
      address: r.address,
      website: r.website,
      notes: r.notes,
      assets: links.filter((l) => l.contactId === r.id).map((l) => ({ assetId: l.assetId, role: l.role })),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });

  app.post<{ Params: Params }>("/api/o/:orgId/contacts", async (req) => {
    requireCap(req, "contacts.manage");
    const body = contactInput.parse(req.body);
    const id = randomUUID();
    await db.insert(contacts).values({ id, orgId: req.org.id, ...body });
    return { id };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/contacts/:id", async (req) => {
    requireCap(req, "contacts.manage");
    const patch = pickPresent(contactInput.partial().parse(req.body), req.body);
    const rows = await db
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id), eq(contacts.orgId, req.org.id), isNull(contacts.deletedAt)))
      .returning({ id: contacts.id });
    if (!rows.length) throw notFound("Contact");
    return { ok: true };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/contacts/:id", async (req) => {
    requireCap(req, "contacts.manage");
    await db
      .update(contacts)
      .set({ deletedAt: new Date() })
      .where(and(eq(contacts.id, req.params.id), eq(contacts.orgId, req.org.id)));
    return { ok: true };
  });
}
