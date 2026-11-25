import { randomUUID } from "node:crypto";
import { defaultOrgSettings, type Locale, type Role } from "@sierra/shared";
import type { DB, Tx } from "../db/client.js";
import { categories, memberships, organizations, users } from "../db/schema.js";
import { hashPassword } from "./auth.js";

const DEFAULT_CATEGORIES: Record<Locale, [string, string][]> = {
  pl: [
    ["Naprawa", "#c2410c"],
    ["Konserwacja", "#0f766e"],
    ["Przegląd", "#1d4ed8"],
    ["Prace polowe", "#4d7c0f"],
    ["Zakup", "#7e22ce"],
    ["Inne", "#57534e"],
  ],
  en: [
    ["Repair", "#c2410c"],
    ["Maintenance", "#0f766e"],
    ["Inspection", "#1d4ed8"],
    ["Field work", "#4d7c0f"],
    ["Purchase", "#7e22ce"],
    ["Other", "#57534e"],
  ],
};

/** "Gospodarstwo Kowalskich" -> "GOS"; falls back to SRA when the name has too few letters. */
export function ticketPrefixFor(name: string) {
  const letters = name
    .normalize("NFD")
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();
  return letters.length >= 3 ? letters.slice(0, 3) : "SRA";
}

export async function createUser(conn: DB | Tx, input: { email: string; name: string; password: string; phone?: string | null; locale?: Locale }) {
  const id = randomUUID();
  await conn.insert(users).values({
    id,
    email: input.email,
    name: input.name,
    phone: input.phone ?? null,
    locale: input.locale ?? "pl",
    passwordHash: await hashPassword(input.password),
  });
  return id;
}

export async function createOrganization(conn: DB | Tx, input: { name: string; ownerId: string; locale: Locale }) {
  const id = randomUUID();
  await conn.insert(organizations).values({ id, name: input.name, ticketPrefix: ticketPrefixFor(input.name), settings: defaultOrgSettings });
  await conn.insert(memberships).values({ orgId: id, userId: input.ownerId, role: "owner" satisfies Role });
  await conn.insert(categories).values(DEFAULT_CATEGORIES[input.locale].map(([name, color], i) => ({ id: randomUUID(), orgId: id, name, color, sortOrder: i })));
  return id;
}
