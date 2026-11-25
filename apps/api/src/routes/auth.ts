import { and, eq, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { locales, loginInput, orgCreateInput, passwordInput, profileInput, registerInput, type MeDto, type Role } from "@sierra/shared";
import { db } from "../db/client.js";
import { memberships, organizations, sessions, users } from "../db/schema.js";
import { createSession, hashPassword, SESSION_COOKIE, verifyPassword } from "../lib/auth.js";
import { HttpError } from "../lib/errors.js";
import { createOrganization, createUser } from "../lib/orgs.js";

const authLimit = { config: { rateLimit: { max: Number(process.env.AUTH_RATE_LIMIT || 20), timeWindow: "1 minute" } } };
export const signupAllowed = () => process.env.ALLOW_SIGNUP !== "false";

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/config", async () => ({ allowSignup: signupAllowed() }));

  app.post("/api/auth/register", authLimit, async (req, reply) => {
    if (!signupAllowed()) throw new HttpError(403, "signup_disabled", "Sign-up is disabled");
    const body = registerInput.extend({ locale: z.enum(locales).default("pl") }).parse(req.body);
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email));
    if (existing.length) throw new HttpError(409, "email_taken", "An account with this e-mail already exists");
    const userId = await db.transaction(async (tx) => {
      const id = await createUser(tx, body);
      await createOrganization(tx, { name: body.orgName, ownerId: id, locale: body.locale });
      return id;
    });
    await createSession(reply, userId);
    return { ok: true };
  });

  app.post("/api/auth/login", authLimit, async (req, reply) => {
    const body = loginInput.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email));
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
      throw new HttpError(401, "invalid_credentials", "Wrong e-mail or password");
    }
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    const sid = req.cookies[SESSION_COOKIE];
    if (sid) await db.delete(sessions).where(eq(sessions.id, sid));
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (req): Promise<MeDto> => {
    const rows = await db
      .select({ orgId: organizations.id, orgName: organizations.name, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(and(eq(memberships.userId, req.user.id), eq(memberships.active, true)))
      .orderBy(memberships.createdAt);
    return { user: req.user, memberships: rows.map((r) => ({ ...r, role: r.role as Role })) };
  });

  app.patch("/api/me", async (req) => {
    const body = profileInput.parse(req.body);
    await db.update(users).set(body).where(eq(users.id, req.user.id));
    return { ok: true };
  });

  app.post("/api/me/password", authLimit, async (req) => {
    const body = passwordInput.parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    if (!user || !(await verifyPassword(body.current, user.passwordHash))) throw new HttpError(400, "wrong_password", "Current password is incorrect");
    await db.update(users).set({ passwordHash: await hashPassword(body.next) }).where(eq(users.id, user.id));
    // Sign out every other device.
    const sid = req.cookies[SESSION_COOKIE] ?? "";
    await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, sid)));
    return { ok: true };
  });

  /** An existing user starts another farm and becomes its owner. */
  app.post("/api/orgs", async (req) => {
    if (!signupAllowed()) throw new HttpError(403, "signup_disabled", "Creating organizations is disabled");
    const body = orgCreateInput.parse(req.body);
    const id = await db.transaction((tx) => createOrganization(tx, { name: body.name, ownerId: req.user.id, locale: req.user.locale }));
    return { id };
  });
}
