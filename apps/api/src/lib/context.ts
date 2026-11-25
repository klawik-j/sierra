import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { can, type Actor, type Capability, type OrgSettings, type Role, type UserDto, defaultOrgSettings } from "@sierra/shared";
import { db } from "../db/client.js";
import { memberships, organizations } from "../db/schema.js";
import { forbidden } from "./errors.js";

/** The tenant a request operates in, resolved from the URL and the caller's membership. */
export interface OrgContext {
  id: string;
  name: string;
  ticketPrefix: string;
  role: Role;
  settings: OrgSettings;
}

declare module "fastify" {
  interface FastifyRequest {
    user: UserDto;
    org: OrgContext;
  }
}

export async function loadOrgContext(userId: string, orgId: string): Promise<OrgContext | null> {
  const [row] = await db
    .select({ id: organizations.id, name: organizations.name, ticketPrefix: organizations.ticketPrefix, settings: organizations.settings, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId), eq(memberships.active, true)));
  if (!row) return null;
  return { ...row, role: row.role as Role, settings: { ...defaultOrgSettings, ...row.settings } };
}

export const allowed = (req: FastifyRequest, capability: Capability) => can(req.org.role, capability, req.org.settings);

export function requireCap(req: FastifyRequest, capability: Capability) {
  if (!allowed(req, capability)) throw forbidden();
}

export const actorOf = (req: FastifyRequest): Actor => ({ userId: req.user.id, role: req.org.role, settings: req.org.settings });

/** For PATCH: keep only the keys the client actually sent (schemas fill absent optionals with null). */
export function pickPresent<T extends Record<string, unknown>>(parsed: T, raw: unknown): Partial<T> {
  const out: Partial<T> = {};
  if (raw && typeof raw === "object") for (const k of Object.keys(raw)) if (k in parsed) (out as Record<string, unknown>)[k] = parsed[k];
  return out;
}
