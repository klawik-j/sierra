import type { Role } from "./enums";

/**
 * Permissions are named capabilities mapped to roles. Routes and UI ask `can(...)`,
 * never compare roles directly, so per-tenant custom roles can be added later.
 */
export const capabilities = [
  "org.manage",
  "members.manage",
  "assets.manage",
  "categories.manage",
  "contacts.manage",
  "tickets.create",
  "tickets.viewAll",
  "tickets.editAny",
  "tickets.assign",
  "tickets.delete",
  "notes.viewShared",
  "worktime.manage",
] as const;
export type Capability = (typeof capabilities)[number];

export interface OrgSettings {
  /** Employees see every ticket (true) or only those they reported / are assigned to (false). */
  employeesSeeAllTickets: boolean;
  /** Employees may report new tickets. */
  employeesCreateTickets: boolean;
}

export const defaultOrgSettings: OrgSettings = {
  employeesSeeAllTickets: true,
  employeesCreateTickets: true,
};

const adminCaps: readonly Capability[] = capabilities.filter((c) => c !== "org.manage");

export function can(role: Role, capability: Capability, settings: OrgSettings = defaultOrgSettings): boolean {
  if (role === "owner") return true;
  if (role === "admin") return adminCaps.includes(capability);
  switch (capability) {
    case "tickets.create":
      return settings.employeesCreateTickets;
    case "tickets.viewAll":
      return settings.employeesSeeAllTickets;
    case "notes.viewShared":
      return true;
    default:
      return false;
  }
}

export interface TicketAccessInfo {
  reporterId: string | null;
  assigneeIds: readonly string[];
}

export interface Actor {
  userId: string;
  role: Role;
  settings: OrgSettings;
}

const involved = (a: Actor, t: TicketAccessInfo) => t.reporterId === a.userId || t.assigneeIds.includes(a.userId);

/** May see the ticket at all (and comment on it). */
export const canViewTicket = (a: Actor, t: TicketAccessInfo) => can(a.role, "tickets.viewAll", a.settings) || involved(a, t);

/** May change status, tick the checklist, add photos and log time. */
export const canWorkOnTicket = (a: Actor, t: TicketAccessInfo) => can(a.role, "tickets.editAny", a.settings) || involved(a, t);

/** May edit the ticket's definition (title, description, priority, due date, links). */
export const canEditTicket = (a: Actor, t: TicketAccessInfo) => can(a.role, "tickets.editAny", a.settings) || t.reporterId === a.userId;

/** Roles a member with `actorRole` is allowed to grant, change or remove. */
export function manageableRoles(actorRole: Role): readonly Role[] {
  if (actorRole === "owner") return ["owner", "admin", "employee"];
  if (actorRole === "admin") return ["admin", "employee"];
  return [];
}

/** Earliest day an employee may still add or correct their own hours: the 1st of the previous month. */
export function workDayWindowStart(today: string): string {
  const [year, month] = today.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 2, 1)).toISOString().slice(0, 10);
}

/**
 * Daily hours and leave feed payroll. People keep their own record from the 1st of the previous month
 * onwards (leave may lie in the future); anyone with `worktime.manage` can correct any day of any member.
 */
export function canEditWorkDay(a: Actor, userId: string, date: string, today: string) {
  if (can(a.role, "worktime.manage", a.settings)) return true;
  return a.userId === userId && date >= workDayWindowStart(today);
}
