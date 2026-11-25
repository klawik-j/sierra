import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Locale, UserDto } from "@sierra/shared";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

const scrypt = promisify(scryptCb) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export const SESSION_COOKIE = "sierra_session";
const SESSION_DAYS = 90;

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = await scrypt(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const token = (bytes = 24) => randomBytes(bytes).toString("base64url");

export async function createSession(reply: FastifyReply, userId: string) {
  const id = token(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ id, userId, expiresAt });
  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
  });
}

export async function userFromRequest(req: FastifyRequest): Promise<UserDto | null> {
  const sid = req.cookies[SESSION_COOKIE];
  if (!sid) return null;
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, phone: users.phone, locale: users.locale })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())));
  return row ? { ...row, locale: row.locale as Locale } : null;
}
