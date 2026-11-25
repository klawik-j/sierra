import { randomUUID } from "node:crypto";
import type { NotificationType } from "@sierra/shared";
import type { DB, Tx } from "../db/client.js";
import { activity, notifications } from "../db/schema.js";

type Conn = DB | Tx;

export async function logActivity(
  conn: Conn,
  entry: { orgId: string; entityType: "ticket" | "asset"; entityId: string; entityLabel: string; actorId: string; action: string; data?: Record<string, unknown> },
) {
  await conn.insert(activity).values({ id: randomUUID(), ...entry, data: entry.data ?? {} });
}

/** In-app notifications; the actor never notifies themselves and each user gets at most one per event. */
export async function notify(
  conn: Conn,
  entry: { orgId: string; ticketId?: string | null; actorId: string; type: NotificationType; userIds: Iterable<string>; data?: Record<string, unknown> },
) {
  const targets = [...new Set(entry.userIds)].filter((u) => u !== entry.actorId);
  if (!targets.length) return;
  await conn.insert(notifications).values(
    targets.map((userId) => ({ id: randomUUID(), orgId: entry.orgId, userId, type: entry.type, ticketId: entry.ticketId ?? null, actorId: entry.actorId, data: entry.data ?? {} })),
  );
}

