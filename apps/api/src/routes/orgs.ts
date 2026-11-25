import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, gt, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  acceptInviteInput,
  categoryInput,
  defaultOrgSettings,
  invitationInput,
  manageableRoles,
  memberCreateInput,
  memberPasswordInput,
  memberUpdateInput,
  orgInput,
  type BootstrapDto,
  type InvitationDto,
  type InvitationInfoDto,
  type MemberDto,
  type NotificationDto,
  type NotificationType,
  type Role,
} from "@sierra/shared";
import { db } from "../db/client.js";
import { categories, invitations, memberships, notifications, organizations, sessions, tickets, users } from "../db/schema.js";
import { createSession, hashPassword, token, userFromRequest } from "../lib/auth.js";
import { pickPresent, requireCap } from "../lib/context.js";
import { badRequest, forbidden, HttpError, notFound } from "../lib/errors.js";
import { createUser } from "../lib/orgs.js";

const INVITE_DAYS = 14;
type Params = { orgId: string; id: string };

export async function listMembers(orgId: string): Promise<MemberDto[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email, phone: users.phone, role: memberships.role, active: memberships.active })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(users.name));
  return rows.map((r) => ({ ...r, role: r.role as Role }));
}

/** User ids of all active members of the organization. */
export async function activeMemberIds(orgId: string) {
  const rows = await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.active, true)));
  return new Set(rows.map((r) => r.userId));
}

async function activeOwnerCount(orgId: string) {
  const [row] = await db
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner"), eq(memberships.active, true)));
  return row?.n ?? 0;
}

async function liveInvitation(tokenValue: string) {
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.token, tokenValue), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())));
  if (!row) throw new HttpError(404, "invite_invalid", "This invitation is no longer valid");
  return row;
}

export async function orgRoutes(app: FastifyInstance) {
  app.get<{ Params: Params }>("/api/o/:orgId/bootstrap", async (req): Promise<BootstrapDto> => {
    const orgId = req.org.id;
    const [[org], members, cats] = await Promise.all([
      db.select().from(organizations).where(eq(organizations.id, orgId)),
      listMembers(orgId),
      db.select({ id: categories.id, name: categories.name, color: categories.color }).from(categories).where(eq(categories.orgId, orgId)).orderBy(asc(categories.sortOrder), asc(categories.name)),
    ]);
    return {
      org: { id: org.id, name: org.name, ticketPrefix: org.ticketPrefix, address: org.address, phone: org.phone, settings: { ...defaultOrgSettings, ...org.settings } },
      role: req.org.role,
      members,
      categories: cats,
    };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId", async (req) => {
    requireCap(req, "org.manage");
    const patch = pickPresent(orgInput.partial().parse(req.body), req.body);
    if (Object.keys(patch).length) await db.update(organizations).set(patch).where(eq(organizations.id, req.org.id));
    return { ok: true };
  });

  // ---- Categories -------------------------------------------------------

  app.post<{ Params: Params }>("/api/o/:orgId/categories", async (req) => {
    requireCap(req, "categories.manage");
    const body = categoryInput.parse(req.body);
    const [{ n }] = await db.select({ n: count() }).from(categories).where(eq(categories.orgId, req.org.id));
    const id = randomUUID();
    await db.insert(categories).values({ id, orgId: req.org.id, ...body, sortOrder: n });
    return { id };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/categories/:id", async (req) => {
    requireCap(req, "categories.manage");
    const body = categoryInput.parse(req.body);
    const rows = await db
      .update(categories)
      .set(body)
      .where(and(eq(categories.id, req.params.id), eq(categories.orgId, req.org.id)))
      .returning({ id: categories.id });
    if (!rows.length) throw notFound("Category");
    return { ok: true };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/categories/:id", async (req) => {
    requireCap(req, "categories.manage");
    await db.delete(categories).where(and(eq(categories.id, req.params.id), eq(categories.orgId, req.org.id)));
    return { ok: true };
  });

  // ---- Members ----------------------------------------------------------

  app.post<{ Params: Params }>("/api/o/:orgId/members", async (req) => {
    requireCap(req, "members.manage");
    const body = memberCreateInput.parse(req.body);
    if (!manageableRoles(req.org.role).includes(body.role)) throw forbidden("You cannot grant this role");
    const orgId = req.org.id;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
    if (existing) {
      const [member] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, existing.id)));
      if (member) throw new HttpError(409, "already_member", "This person is already a member");
      // Existing account joins the farm; their own name and password stay untouched.
      await db.insert(memberships).values({ orgId, userId: existing.id, role: body.role });
      return { userId: existing.id };
    }
    const userId = await db.transaction(async (tx) => {
      const id = await createUser(tx, { ...body, locale: req.user.locale });
      await tx.insert(memberships).values({ orgId, userId: id, role: body.role });
      return id;
    });
    return { userId };
  });

  app.patch<{ Params: Params }>("/api/o/:orgId/members/:id", async (req) => {
    requireCap(req, "members.manage");
    const patch = pickPresent(memberUpdateInput.partial().parse(req.body), req.body);
    const orgId = req.org.id;
    const [target] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, req.params.id)));
    if (!target) throw notFound("Member");
    const grantable = manageableRoles(req.org.role);
    if (!grantable.includes(target.role as Role) || (patch.role && !grantable.includes(patch.role))) throw forbidden("You cannot change this member");
    const losesOwner = target.role === "owner" && target.active && ((patch.role && patch.role !== "owner") || patch.active === false);
    if (losesOwner && (await activeOwnerCount(orgId)) <= 1) throw badRequest("last_owner", "The farm must keep at least one owner");
    if (Object.keys(patch).length) {
      await db
        .update(memberships)
        .set(patch)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, target.userId)));
    }
    return { ok: true };
  });

  /**
   * No e-mail delivery yet, so a manager can set a temporary password for someone who forgot theirs.
   * Refused for accounts that also belong to another farm: one tenant must never be able to take over
   * an identity that another tenant relies on.
   */
  app.post<{ Params: Params }>("/api/o/:orgId/members/:id/password", async (req) => {
    requireCap(req, "members.manage");
    const body = memberPasswordInput.parse(req.body);
    const orgId = req.org.id;
    const all = await db.select({ orgId: memberships.orgId, role: memberships.role }).from(memberships).where(eq(memberships.userId, req.params.id));
    const target = all.find((m) => m.orgId === orgId);
    if (!target) throw notFound("Member");
    if (!manageableRoles(req.org.role).includes(target.role as Role)) throw forbidden("You cannot change this member");
    if (req.params.id === req.user.id) throw badRequest("validation", "Change your own password in Settings");
    if (all.length > 1) throw new HttpError(409, "multi_farm_account", "This account also belongs to another farm; its owner must change the password themselves");
    await db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: await hashPassword(body.password) }).where(eq(users.id, req.params.id));
      await tx.delete(sessions).where(eq(sessions.userId, req.params.id));
    });
    return { ok: true };
  });

  // ---- Invitations ------------------------------------------------------

  app.get<{ Params: Params }>("/api/o/:orgId/invitations", async (req): Promise<InvitationDto[]> => {
    requireCap(req, "members.manage");
    const rows = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.orgId, req.org.id), isNull(invitations.acceptedAt), gt(invitations.expiresAt, new Date())))
      .orderBy(desc(invitations.createdAt));
    return rows.map((r) => ({ id: r.id, token: r.token, email: r.email, role: r.role as Role, expiresAt: r.expiresAt.toISOString(), createdAt: r.createdAt.toISOString() }));
  });

  app.post<{ Params: Params }>("/api/o/:orgId/invitations", async (req) => {
    requireCap(req, "members.manage");
    const body = invitationInput.parse(req.body);
    if (!manageableRoles(req.org.role).includes(body.role)) throw forbidden("You cannot grant this role");
    const row = { id: randomUUID(), orgId: req.org.id, token: token(24), email: body.email, role: body.role, invitedBy: req.user.id, expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5) };
    await db.insert(invitations).values(row);
    return { id: row.id, token: row.token };
  });

  app.delete<{ Params: Params }>("/api/o/:orgId/invitations/:id", async (req) => {
    requireCap(req, "members.manage");
    await db.delete(invitations).where(and(eq(invitations.id, req.params.id), eq(invitations.orgId, req.org.id)));
    return { ok: true };
  });

  // Public: the token itself is the secret.
  app.get<{ Params: { token: string } }>("/api/invitations/:token", async (req): Promise<InvitationInfoDto> => {
    const inv = await liveInvitation(req.params.token);
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, inv.orgId));
    const [inviter] = inv.invitedBy ? await db.select({ name: users.name }).from(users).where(eq(users.id, inv.invitedBy)) : [];
    return { orgName: org.name, role: inv.role as Role, email: inv.email, invitedBy: inviter?.name ?? null };
  });

  const acceptLimit = { config: { rateLimit: { max: Number(process.env.AUTH_RATE_LIMIT || 20), timeWindow: "1 minute" } } };
  app.post<{ Params: { token: string } }>("/api/invitations/:token/accept", acceptLimit, async (req, reply) => {
    const inv = await liveInvitation(req.params.token);
    const current = await userFromRequest(req);
    let userId: string;
    if (current) {
      userId = current.id;
    } else {
      const body = acceptInviteInput.parse(req.body);
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
      if (taken) throw new HttpError(409, "email_taken", "An account with this e-mail already exists. Sign in first, then open the invitation link again.");
      userId = await createUser(db, body);
    }
    await db.transaction(async (tx) => {
      // A previously removed member who is invited again is simply re-activated.
      await tx
        .insert(memberships)
        .values({ orgId: inv.orgId, userId, role: inv.role })
        .onConflictDoUpdate({ target: [memberships.orgId, memberships.userId], set: { active: true } });
      await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    });
    if (!current) await createSession(reply, userId);
    return { orgId: inv.orgId };
  });

  // ---- Notifications ----------------------------------------------------

  app.get<{ Params: Params }>("/api/o/:orgId/notifications", async (req): Promise<NotificationDto[]> => {
    const rows = await db
      .select({ n: notifications, number: tickets.number, title: tickets.title })
      .from(notifications)
      .leftJoin(tickets, eq(tickets.id, notifications.ticketId))
      .where(and(eq(notifications.orgId, req.org.id), eq(notifications.userId, req.user.id)))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return rows.map(({ n, number, title }) => ({
      id: n.id,
      type: n.type as NotificationType,
      ticketId: n.ticketId,
      ticketKey: number === null ? null : `${req.org.ticketPrefix}-${number}`,
      ticketTitle: title,
      actorId: n.actorId,
      data: n.data,
      readAt: n.readAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    }));
  });

  app.post<{ Params: Params; Body: { id?: string } }>("/api/o/:orgId/notifications/read", async (req) => {
    const id = typeof req.body?.id === "string" ? req.body.id : null;
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.orgId, req.org.id), eq(notifications.userId, req.user.id), isNull(notifications.readAt), id ? eq(notifications.id, id) : undefined));
    return { ok: true };
  });
}
