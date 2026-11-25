import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";

process.env.PGLITE_DIR = "memory";
process.env.DATABASE_URL = "";
process.env.STORAGE_DRIVER = "fs";
process.env.FS_STORAGE_DIR = mkdtempSync(path.join(tmpdir(), "sierra-test-"));
process.env.LOG_LEVEL = "silent";
process.env.AUTH_RATE_LIMIT = "1000";

const { migrate } = await import("../src/db/client.js");
const { buildApp } = await import("../src/app.js");
const { injectClient } = await import("../src/lib/inject-client.js");
const { default: sharp } = await import("sharp");

type Client = ReturnType<typeof injectClient>;
let app: FastifyInstance;

/** Farm A: owner, admin, employee. Farm B: a different owner. */
let ownerA: Client, adminA: Client, workerA: Client, ownerB: Client;
let orgA: string, orgB: string;
let ids: { owner: string; admin: string; worker: string };

async function signUp(email: string, name: string, orgName: string) {
  const c = injectClient(app);
  await c.ok("POST", "/api/auth/register", { email, password: "password1", name, orgName });
  const me = await c.ok("GET", "/api/me");
  return { c, orgId: me.memberships[0].orgId as string, userId: me.user.id as string };
}

async function signIn(email: string) {
  const c = injectClient(app);
  await c.ok("POST", "/api/auth/login", { email, password: "password1" });
  return c;
}

function multipart(fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) {
  const boundary = "----sierra-test";
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`), file.data, Buffer.from(`\r\n--${boundary}--\r\n`));
  return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}` } };
}

async function upload(c: Client, orgId: string, fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) {
  const { payload, headers } = multipart(fields, file);
  return c.call("POST", `/api/o/${orgId}/files`, payload, headers);
}

const png = () => sharp({ create: { width: 64, height: 48, channels: 3, background: "#3a7d44" } }).png().toBuffer();

before(async () => {
  await migrate();
  app = await buildApp();
  const a = await signUp("owner-a@example.com", "Olga Owner", "Alpha Farm");
  ownerA = a.c;
  orgA = a.orgId;
  const admin = await ownerA.ok("POST", `/api/o/${orgA}/members`, { email: "admin-a@example.com", name: "Adam Admin", password: "password1", role: "admin" });
  const worker = await ownerA.ok("POST", `/api/o/${orgA}/members`, { email: "worker-a@example.com", name: "Wanda Worker", password: "password1", role: "employee" });
  ids = { owner: a.userId, admin: admin.userId, worker: worker.userId };
  adminA = await signIn("admin-a@example.com");
  workerA = await signIn("worker-a@example.com");
  const b = await signUp("owner-b@example.com", "Bob Other", "Beta Farm");
  ownerB = b.c;
  orgB = b.orgId;
});

after(async () => {
  await app.close();
});

describe("auth", () => {
  test("rejects unauthenticated, wrong password and missing CSRF header", async () => {
    const anon = injectClient(app);
    assert.equal((await anon.call("GET", "/api/me")).status, 401);
    const bad = await anon.call("POST", "/api/auth/login", { email: "owner-a@example.com", password: "nope-nope" });
    assert.equal(bad.status, 401);
    assert.equal(bad.body.error, "invalid_credentials");
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner-a@example.com", password: "password1" } });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "csrf");
  });

  test("register creates a farm with the user as owner and default categories", async () => {
    const boot = await ownerA.ok("GET", `/api/o/${orgA}/bootstrap`);
    assert.equal(boot.role, "owner");
    assert.equal(boot.org.ticketPrefix, "ALP");
    assert.equal(boot.members.length, 3);
    assert.ok(boot.categories.length >= 5);
    assert.equal((await ownerA.call("POST", "/api/auth/register", { email: "owner-a@example.com", password: "password1", name: "x", orgName: "y" })).body.error, "email_taken");
  });

  test("password change requires the current password", async () => {
    const { c } = await signUp("pw@example.com", "Pw", "Pw Farm");
    assert.equal((await c.call("POST", "/api/me/password", { current: "wrong-one", next: "password2" })).body.error, "wrong_password");
    await c.ok("POST", "/api/me/password", { current: "password1", next: "password2" });
    const again = injectClient(app);
    assert.equal((await again.call("POST", "/api/auth/login", { email: "pw@example.com", password: "password1" })).status, 401);
    await again.ok("POST", "/api/auth/login", { email: "pw@example.com", password: "password2" });
  });
});

describe("tenant isolation", () => {
  let ticketA: string, assetA: string, contactA: string, fileA: string, noteA: string;

  before(async () => {
    assetA = (await ownerA.ok("POST", `/api/o/${orgA}/assets`, { kind: "machine", name: "Tractor A", type: "tractor" })).id;
    contactA = (await ownerA.ok("POST", `/api/o/${orgA}/contacts`, { name: "Mechanic A", phone: "+48 600 000 000" })).id;
    ticketA = (await ownerA.ok("POST", `/api/o/${orgA}/tickets`, { title: "Secret of farm A", assetIds: [assetA] })).id;
    noteA = (await ownerA.ok("POST", `/api/o/${orgA}/notes`, { body: "shared in A", shared: true })).id;
    const up = await upload(ownerA, orgA, { ownerType: "ticket", ownerId: ticketA, tag: "before" }, { name: "a.png", type: "image/png", data: await png() });
    assert.equal(up.status, 200);
    fileA = up.body.id;
  });

  test("another farm's URL is a 404 for non-members", async () => {
    for (const p of ["bootstrap", "tickets", "assets", "contacts", "notes", "activity", "notifications", "invitations", `tickets/${ticketA}`, `files/${fileA}/thumb`]) {
      assert.equal((await ownerB.call("GET", `/api/o/${orgA}/${p}`)).status, 404, p);
    }
    assert.equal((await ownerB.call("POST", `/api/o/${orgA}/tickets`, { title: "intruder" })).status, 404);
    assert.equal((await ownerB.call("PATCH", `/api/o/${orgA}`, { name: "Hacked" })).status, 404);
  });

  test("ids from another farm cannot be reached through one's own farm", async () => {
    const b = `/api/o/${orgB}`;
    assert.equal((await ownerB.call("GET", `${b}/tickets/${ticketA}`)).status, 404);
    assert.equal((await ownerB.call("PATCH", `${b}/tickets/${ticketA}`, { title: "x" })).status, 404);
    assert.equal((await ownerB.call("DELETE", `${b}/tickets/${ticketA}`)).status, 404);
    assert.equal((await ownerB.call("POST", `${b}/tickets/${ticketA}/comments`, { body: "x" })).status, 404);
    assert.equal((await ownerB.call("GET", `${b}/assets/${assetA}`)).status, 404);
    assert.equal((await ownerB.call("PATCH", `${b}/assets/${assetA}`, { name: "x" })).status, 404);
    assert.equal((await ownerB.call("PATCH", `${b}/contacts/${contactA}`, { name: "x" })).status, 404);
    assert.equal((await ownerB.call("PATCH", `${b}/notes/${noteA}`, { body: "x" })).status, 404);
    assert.equal((await ownerB.call("GET", `${b}/files/${fileA}/original`)).status, 404);
    assert.equal((await ownerB.call("DELETE", `${b}/files/${fileA}`)).status, 404);
    assert.equal((await upload(ownerB, orgB, { ownerType: "ticket", ownerId: ticketA }, { name: "a.png", type: "image/png", data: await png() })).status, 404);
  });

  test("foreign ids cannot be linked to own records", async () => {
    const b = `/api/o/${orgB}`;
    assert.equal((await ownerB.call("POST", `${b}/tickets`, { title: "t", assetIds: [assetA] })).body.error, "invalid_reference");
    assert.equal((await ownerB.call("POST", `${b}/tickets`, { title: "t", contactIds: [contactA] })).body.error, "invalid_reference");
    assert.equal((await ownerB.call("POST", `${b}/tickets`, { title: "t", assigneeIds: [ids.worker] })).body.error, "invalid_reference");
    assert.equal((await ownerB.call("POST", `${b}/notes`, { body: "n", ticketId: ticketA })).status, 404);
    assert.equal((await ownerB.call("POST", `${b}/notes`, { body: "n", assetId: assetA })).body.error, "invalid_reference");
  });

  test("lists only contain own data and numbering is per farm", async () => {
    const created = await ownerB.ok("POST", `/api/o/${orgB}/tickets`, { title: "First of B" });
    assert.equal(created.key, "BET-1");
    const list = await ownerB.ok("GET", `/api/o/${orgB}/tickets`);
    assert.deepEqual(list.map((t: { title: string }) => t.title), ["First of B"]);
    assert.equal((await ownerB.ok("GET", `/api/o/${orgB}/assets`)).length, 0);
    assert.equal((await ownerB.ok("GET", `/api/o/${orgB}/notes`)).length, 0);
    assert.ok((await ownerB.ok("GET", `/api/o/${orgB}/activity`)).every((a: { entityLabel: string }) => !a.entityLabel.includes("Secret")));
  });
});

describe("roles", () => {
  test("employees cannot manage assets, contacts, members or settings", async () => {
    const a = `/api/o/${orgA}`;
    assert.equal((await workerA.call("POST", `${a}/assets`, { kind: "machine", name: "x", type: "tractor" })).status, 403);
    assert.equal((await workerA.call("POST", `${a}/contacts`, { name: "x" })).status, 403);
    assert.equal((await workerA.call("POST", `${a}/members`, { email: "n@example.com", name: "n", password: "password1", role: "employee" })).status, 403);
    assert.equal((await workerA.call("POST", `${a}/invitations`, { role: "employee" })).status, 403);
    assert.equal((await workerA.call("POST", `${a}/categories`, { name: "x", color: "#112233" })).status, 403);
    assert.equal((await workerA.call("PATCH", a, { name: "x" })).status, 403);
    assert.equal((await adminA.call("PATCH", a, { name: "x" })).status, 403, "only owners change farm settings");
    assert.equal((await adminA.call("POST", `${a}/assets`, { kind: "building", name: "Barn", type: "barn" })).status, 200);
  });

  test("admins cannot grant or change the owner role; the last owner is protected", async () => {
    const a = `/api/o/${orgA}`;
    assert.equal((await adminA.call("POST", `${a}/members`, { email: "o2@example.com", name: "o2", password: "password1", role: "owner" })).status, 403);
    assert.equal((await adminA.call("PATCH", `${a}/members/${ids.owner}`, { role: "employee" })).status, 403);
    assert.equal((await adminA.call("PATCH", `${a}/members/${ids.worker}`, { role: "owner" })).status, 403);
    assert.equal((await ownerA.call("PATCH", `${a}/members/${ids.owner}`, { role: "admin" })).body.error, "last_owner");
    assert.equal((await ownerA.call("PATCH", `${a}/members/${ids.owner}`, { active: false })).body.error, "last_owner");
  });

  test("a deactivated member loses access immediately", async () => {
    const a = `/api/o/${orgA}`;
    const { userId } = await ownerA.ok("POST", `${a}/members`, { email: "temp@example.com", name: "Temp", password: "password1", role: "employee" });
    const temp = await signIn("temp@example.com");
    assert.equal((await temp.call("GET", `${a}/tickets`)).status, 200);
    await adminA.ok("PATCH", `${a}/members/${userId}`, { active: false });
    assert.equal((await temp.call("GET", `${a}/tickets`)).status, 404);
    assert.equal((await temp.ok("GET", "/api/me")).memberships.length, 0);
  });

  test("managers can set a temporary password, but never for accounts shared with another farm", async () => {
    const a = `/api/o/${orgA}`;
    const { userId } = await ownerA.ok("POST", `${a}/members`, { email: "forgot@example.com", name: "Forgetful", password: "password1", role: "employee" });
    const old = await signIn("forgot@example.com");
    assert.equal((await workerA.call("POST", `${a}/members/${userId}/password`, { password: "newpass123" })).status, 403);
    assert.equal((await adminA.call("POST", `${a}/members/${ids.owner}/password`, { password: "newpass123" })).status, 403, "admin cannot reset an owner");
    assert.equal((await adminA.call("POST", `${a}/members/${userId}/password`, { password: "short" })).status, 400);
    await adminA.ok("POST", `${a}/members/${userId}/password`, { password: "newpass123" });
    assert.equal((await old.call("GET", "/api/me")).status, 401, "existing sessions are signed out");
    assert.equal((await injectClient(app).call("POST", "/api/auth/login", { email: "forgot@example.com", password: "password1" })).status, 401);
    const fresh = injectClient(app);
    await fresh.ok("POST", "/api/auth/login", { email: "forgot@example.com", password: "newpass123" });

    // the same person joins a second farm -> farm A can no longer touch the password
    const other = await signUp("other-owner@example.com", "Other", "Gamma Farm");
    const { token } = await other.c.ok("POST", `/api/o/${other.orgId}/invitations`, { role: "employee" });
    await fresh.ok("POST", `/api/invitations/${token}/accept`, {});
    assert.equal((await adminA.call("POST", `${a}/members/${userId}/password`, { password: "takeover123" })).body.error, "multi_farm_account");
    assert.equal((await other.c.call("POST", `/api/o/${other.orgId}/members/${userId}/password`, { password: "takeover123" })).body.error, "multi_farm_account");
    assert.equal((await ownerB.call("POST", `/api/o/${orgB}/members/${userId}/password`, { password: "takeover123" })).status, 404, "not a member of that farm");
  });

  test("employee ticket permissions", async () => {
    const a = `/api/o/${orgA}`;
    const theirs = (await ownerA.ok("POST", `${a}/tickets`, { title: "Owner's ticket" })).id;
    // may report, but only assign to self
    assert.equal((await workerA.call("POST", `${a}/tickets`, { title: "x", assigneeIds: [ids.admin] })).status, 403);
    const own = (await workerA.ok("POST", `${a}/tickets`, { title: "Broken gate", assigneeIds: [ids.worker] })).id;
    await workerA.ok("PATCH", `${a}/tickets/${own}`, { title: "Broken gate at the barn", status: "in_progress" });
    // someone else's ticket: can comment, cannot edit, work on it, reassign or delete
    await workerA.ok("POST", `${a}/tickets/${theirs}/comments`, { body: "I can look at it" });
    assert.equal((await workerA.call("PATCH", `${a}/tickets/${theirs}`, { title: "x" })).status, 403);
    assert.equal((await workerA.call("PATCH", `${a}/tickets/${theirs}`, { status: "done" })).status, 403);
    assert.equal((await workerA.call("POST", `${a}/tickets/${theirs}/time`, { minutes: 10, date: "2026-01-01" })).status, 403);
    assert.equal((await workerA.call("PATCH", `${a}/tickets/${theirs}`, { assigneeIds: [ids.admin] })).status, 403);
    assert.equal((await workerA.call("DELETE", `${a}/tickets/${theirs}`)).status, 403);
    // takes it -> may now work on it, still not redefine it
    await workerA.ok("PATCH", `${a}/tickets/${theirs}`, { assigneeIds: [ids.worker] });
    await workerA.ok("PATCH", `${a}/tickets/${theirs}`, { status: "done" });
    await workerA.ok("POST", `${a}/tickets/${theirs}/time`, { minutes: 30, date: "2026-01-01" });
    assert.equal((await workerA.call("PATCH", `${a}/tickets/${theirs}`, { priority: "urgent" })).status, 403);
  });

  test("farm settings can stop employees from reporting tickets", async () => {
    const a = `/api/o/${orgA}`;
    await ownerA.ok("PATCH", a, { settings: { employeesSeeAllTickets: true, employeesCreateTickets: false } });
    assert.equal((await workerA.call("POST", `${a}/tickets`, { title: "x" })).status, 403);
    await ownerA.ok("PATCH", a, { settings: { employeesSeeAllTickets: true, employeesCreateTickets: true } });
    assert.equal((await workerA.call("POST", `${a}/tickets`, { title: "x" })).status, 200);
  });
});

describe("restricted ticket visibility", () => {
  test("employees only see tickets they reported or are assigned to", async () => {
    const a = `/api/o/${orgA}`;
    const hidden = (await ownerA.ok("POST", `${a}/tickets`, { title: "Payroll problem" })).id;
    const assigned = (await ownerA.ok("POST", `${a}/tickets`, { title: "Feed the cows", assigneeIds: [ids.worker] })).id;
    const up = await upload(ownerA, orgA, { ownerType: "ticket", ownerId: hidden }, { name: "p.png", type: "image/png", data: await png() });
    await ownerA.ok("PATCH", a, { settings: { employeesSeeAllTickets: false, employeesCreateTickets: true } });
    try {
      const list = await workerA.ok("GET", `${a}/tickets`);
      const titles = list.map((t: { title: string }) => t.title);
      assert.ok(titles.includes("Feed the cows"));
      assert.ok(!titles.includes("Payroll problem"));
      assert.ok(list.every((t: { reporterId: string; assigneeIds: string[] }) => t.reporterId === ids.worker || t.assigneeIds.includes(ids.worker)));
      assert.equal((await workerA.call("GET", `${a}/tickets/${hidden}`)).status, 404);
      assert.equal((await workerA.call("POST", `${a}/tickets/${hidden}/comments`, { body: "x" })).status, 404);
      assert.equal((await workerA.call("PATCH", `${a}/tickets/${hidden}`, { assigneeIds: [ids.worker] })).status, 404);
      assert.equal((await workerA.call("GET", `${a}/files/${up.body.id}/preview`)).status, 404);
      assert.equal((await workerA.call("GET", `${a}/tickets/${assigned}`)).status, 200);
      const feed = await workerA.ok("GET", `${a}/activity?limit=100`);
      assert.ok(feed.every((e: { entityLabel: string }) => !e.entityLabel.includes("Payroll")));
      assert.ok((await ownerA.ok("GET", `${a}/activity?limit=100`)).some((e: { entityLabel: string }) => e.entityLabel.includes("Payroll")));
    } finally {
      await ownerA.ok("PATCH", a, { settings: { employeesSeeAllTickets: true, employeesCreateTickets: true } });
    }
  });
});

describe("tickets", () => {
  test("full lifecycle: links, checklist, comments, time, history, notifications", async () => {
    const a = `/api/o/${orgA}`;
    const machine = (await ownerA.ok("POST", `${a}/assets`, { kind: "machine", name: "Combine", type: "combine", details: { make: "Claas", year: 2016 } })).id;
    const contact = (await ownerA.ok("POST", `${a}/contacts`, { name: "Service", phone: "123" })).id;
    await workerA.ok("POST", `${a}/notifications/read`, {});
    const { id, key } = await ownerA.ok("POST", `${a}/tickets`, {
      title: "Replace belt",
      description: "Main drive belt",
      priority: "high",
      assigneeIds: [ids.worker],
      assetIds: [machine],
      contactIds: [contact],
      dueDate: "2030-05-01",
      estimateMinutes: 120,
      labels: ["belt"],
      checklist: ["Order part", "Fit part"],
    });
    assert.match(key, /^ALP-\d+$/);

    let t = await workerA.ok("GET", `${a}/tickets/${id}`);
    assert.equal(t.status, "todo");
    assert.deepEqual(t.assigneeIds, [ids.worker]);
    assert.deepEqual(t.assetIds, [machine]);
    assert.deepEqual(t.contactIds, [contact]);
    assert.equal(t.checklist.length, 2);
    assert.equal(t.completedAt, null);

    await workerA.ok("PATCH", `${a}/tickets/${id}/checklist/${t.checklist[0].id}`, { done: true });
    await workerA.ok("POST", `${a}/tickets/${id}/checklist`, { text: "Test run" });
    await workerA.ok("POST", `${a}/tickets/${id}/time`, { minutes: 45, date: "2030-04-30", note: "prep" });
    await workerA.ok("POST", `${a}/tickets/${id}/time`, { minutes: 30, date: "2030-05-01" });
    await workerA.ok("POST", `${a}/tickets/${id}/comments`, { body: "Done, @Adam Admin please check" });
    await workerA.ok("PATCH", `${a}/tickets/${id}`, { status: "done" });
    await ownerA.ok("PATCH", `${a}/tickets/${id}`, { priority: "low", dueDate: null, assigneeIds: [ids.worker, ids.admin] });

    t = await ownerA.ok("GET", `${a}/tickets/${id}`);
    assert.equal(t.status, "done");
    assert.ok(t.completedAt);
    assert.equal(t.spentMinutes, 75);
    assert.equal(t.checklistTotal, 3);
    assert.equal(t.checklistDone, 1);
    assert.equal(t.commentCount, 1);
    assert.equal(t.dueDate, null);
    assert.equal(t.description, "Main drive belt", "fields absent from a PATCH stay untouched");
    assert.deepEqual([...t.assigneeIds].sort(), [ids.worker, ids.admin].sort());
    const actions = t.activity.map((x: { action: string }) => x.action);
    for (const expected of ["created", "time", "commented", "status", "priority", "due", "assigned"]) assert.ok(actions.includes(expected), expected);

    const inList = (await ownerA.ok("GET", `${a}/tickets`)).find((x: { id: string }) => x.id === id);
    assert.equal(inList.spentMinutes, 75);

    const workerNotes = await workerA.ok("GET", `${a}/notifications`);
    assert.ok(workerNotes.some((n: { type: string; ticketId: string }) => n.type === "assigned" && n.ticketId === id));
    const adminNotes = await adminA.ok("GET", `${a}/notifications`);
    assert.ok(adminNotes.some((n: { type: string; ticketId: string }) => n.type === "mention" && n.ticketId === id));
    assert.ok(adminNotes.some((n: { type: string; ticketId: string }) => n.type === "assigned" && n.ticketId === id));
    const ownerNotes = await ownerA.ok("GET", `${a}/notifications`);
    assert.ok(ownerNotes.some((n: { type: string; ticketId: string; ticketKey: string }) => n.type === "status" && n.ticketId === id && n.ticketKey === key));
    assert.ok(ownerNotes.every((n: { actorId: string }) => n.actorId !== ids.owner), "no self-notifications");

    await ownerA.ok("PATCH", `${a}/tickets/${id}`, { status: "in_progress" });
    assert.equal((await ownerA.ok("GET", `${a}/tickets/${id}`)).completedAt, null);

    await ownerA.ok("DELETE", `${a}/tickets/${id}`);
    assert.equal((await ownerA.call("GET", `${a}/tickets/${id}`)).status, 404);
    assert.ok(!(await ownerA.ok("GET", `${a}/tickets`)).some((x: { id: string }) => x.id === id));
  });

  test("validation errors name the rejected fields", async () => {
    const a = `/api/o/${orgA}`;
    const bad = await ownerA.call("POST", `${a}/assets`, { kind: "machine", name: "", type: "tractor", details: { year: 15, plate: "x".repeat(21) } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error, "validation");
    const byPath = Object.fromEntries(bad.body.issues.map((i: { path: string }) => [i.path, i]));
    assert.deepEqual(Object.keys(byPath).sort(), ["details.plate", "details.year", "name"]);
    assert.deepEqual({ code: byPath["details.year"].code, origin: byPath["details.year"].origin, minimum: byPath["details.year"].minimum }, { code: "too_small", origin: "number", minimum: 1900 });
    assert.deepEqual({ code: byPath["details.plate"].code, maximum: byPath["details.plate"].maximum }, { code: "too_big", maximum: 20 });
    assert.deepEqual({ code: byPath.name.code, origin: byPath.name.origin, minimum: byPath.name.minimum }, { code: "too_small", origin: "string", minimum: 1 });
    const mail = await ownerA.call("POST", `${a}/contacts`, { name: "x", email: "not-an-email" });
    assert.equal(mail.body.issues[0].path, "email");
  });

  test("validation errors are 400", async () => {
    const a = `/api/o/${orgA}`;
    assert.equal((await ownerA.call("POST", `${a}/tickets`, { title: "" })).status, 400);
    assert.equal((await ownerA.call("POST", `${a}/tickets`, { title: "x", priority: "extreme" })).status, 400);
    assert.equal((await ownerA.call("POST", `${a}/tickets`, { title: "x", dueDate: "tomorrow" })).status, 400);
    assert.equal((await ownerA.call("POST", `${a}/assets`, { kind: "machine", name: "x", type: "barn" })).status, 400);
  });
});

describe("assets", () => {
  test("readings, cover photo and contact links", async () => {
    const a = `/api/o/${orgA}`;
    const id = (await ownerA.ok("POST", `${a}/assets`, { kind: "machine", name: "Deere", type: "tractor", details: { plate: "PO 123", inspectionDue: "2030-01-01" } })).id;
    await workerA.ok("POST", `${a}/assets/${id}/readings`, { kind: "hours", value: 100, recordedAt: "2030-01-01" });
    await workerA.ok("POST", `${a}/assets/${id}/readings`, { kind: "hours", value: 140, recordedAt: "2030-02-01" });
    await workerA.ok("POST", `${a}/assets/${id}/readings`, { kind: "km", value: 5000, recordedAt: "2030-01-15" });
    const up = await upload(ownerA, orgA, { ownerType: "asset", ownerId: id }, { name: "t.png", type: "image/png", data: await png() });
    assert.equal(up.status, 200);
    assert.equal((await upload(workerA, orgA, { ownerType: "asset", ownerId: id }, { name: "t.png", type: "image/png", data: await png() })).status, 403);
    const contact = (await ownerA.ok("POST", `${a}/contacts`, { name: "Dealer" })).id;
    await ownerA.ok("PUT", `${a}/assets/${id}/contacts/${contact}`, { role: "Dealer" });

    const detail = await workerA.ok("GET", `${a}/assets/${id}`);
    assert.equal(detail.hours, 140);
    assert.equal(detail.km, 5000);
    assert.equal(detail.coverFileId, up.body.id);
    assert.equal(detail.details.plate, "PO 123");
    assert.equal(detail.readings.length, 3);
    assert.deepEqual(detail.contacts, [{ contactId: contact, role: "Dealer" }]);
    const listed = (await ownerA.ok("GET", `${a}/contacts`)).find((c: { id: string }) => c.id === contact);
    assert.deepEqual(listed.assets, [{ assetId: id, role: "Dealer" }]);

    await ownerA.ok("PATCH", `${a}/assets/${id}`, { status: "attention" });
    const after = await ownerA.ok("GET", `${a}/assets/${id}`);
    assert.equal(after.status, "attention");
    assert.equal(after.details.plate, "PO 123");

    await ownerA.ok("DELETE", `${a}/files/${up.body.id}`);
    assert.equal((await ownerA.ok("GET", `${a}/assets/${id}`)).coverFileId, null);
    await ownerA.ok("DELETE", `${a}/assets/${id}`);
    assert.equal((await ownerA.call("GET", `${a}/assets/${id}`)).status, 404);
  });
});

describe("files", () => {
  test("photos get thumbnails; before/after tags; unsafe types are refused", async () => {
    const a = `/api/o/${orgA}`;
    const ticket = (await ownerA.ok("POST", `${a}/tickets`, { title: "Photo ticket", assigneeIds: [ids.worker] })).id;
    const up = await upload(workerA, orgA, { ownerType: "ticket", ownerId: ticket, tag: "before" }, { name: "before.png", type: "image/png", data: await png() });
    assert.equal(up.status, 200);
    assert.equal(up.body.tag, "before");
    assert.equal(up.body.isImage, true);
    assert.equal(up.body.width, 64);
    const thumb = await workerA.call("GET", `${a}/files/${up.body.id}/thumb`);
    assert.equal(thumb.status, 200);
    assert.equal(thumb.headers["content-type"], "image/jpeg");
    assert.equal(thumb.headers["x-content-type-options"], "nosniff");
    await workerA.ok("PATCH", `${a}/files/${up.body.id}`, { tag: "after" });
    const detail = await ownerA.ok("GET", `${a}/tickets/${ticket}`);
    assert.equal(detail.files[0].tag, "after");
    assert.equal(detail.photoCount, 1);

    const html = await upload(workerA, orgA, { ownerType: "ticket", ownerId: ticket }, { name: "x.html", type: "text/html", data: Buffer.from("<script>alert(1)</script>") });
    assert.equal(html.status, 415);
    const svg = await upload(workerA, orgA, { ownerType: "ticket", ownerId: ticket }, { name: "x.svg", type: "image/svg+xml", data: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
    assert.equal(svg.status, 415);
    const fake = await upload(workerA, orgA, { ownerType: "ticket", ownerId: ticket }, { name: "x.png", type: "image/png", data: Buffer.from("not an image") });
    assert.equal(fake.status, 415);
    const pdf = await upload(workerA, orgA, { ownerType: "ticket", ownerId: ticket, tag: "document" }, { name: "manual.pdf", type: "application/pdf", data: Buffer.from("%PDF-1.4\n") });
    assert.equal(pdf.status, 200);
    assert.equal(pdf.body.isImage, false);

    await workerA.ok("DELETE", `${a}/files/${up.body.id}`);
    assert.equal((await workerA.call("GET", `${a}/files/${up.body.id}/thumb`)).status, 404);
  });
});

describe("notes", () => {
  test("private notes stay private, shared notes are visible, convert makes a ticket", async () => {
    const a = `/api/o/${orgA}`;
    const priv = (await workerA.ok("POST", `${a}/notes`, { title: "Private", body: "my own" })).id;
    const shared = (await workerA.ok("POST", `${a}/notes`, { body: "Tractor makes a noise\nat high revs", shared: true })).id;
    const photo = await upload(workerA, orgA, { ownerType: "note", ownerId: shared }, { name: "n.png", type: "image/png", data: await png() });
    assert.equal(photo.status, 200);

    const ownerSees = (await ownerA.ok("GET", `${a}/notes`)).map((n: { id: string }) => n.id);
    assert.ok(ownerSees.includes(shared));
    assert.ok(!ownerSees.includes(priv));
    assert.equal((await ownerA.call("PATCH", `${a}/notes/${priv}`, { body: "x" })).status, 404);
    assert.equal((await ownerA.call("PATCH", `${a}/notes/${shared}`, { body: "x" })).status, 403);
    assert.equal((await ownerA.call("DELETE", `${a}/notes/${shared}`)).status, 403);
    assert.equal((await ownerA.call("GET", `${a}/files/${photo.body.id}/thumb`)).status, 200);
    assert.equal((await upload(ownerA, orgA, { ownerType: "note", ownerId: priv }, { name: "n.png", type: "image/png", data: await png() })).status, 404);

    const { id: ticketId } = await workerA.ok("POST", `${a}/notes/${shared}/convert`);
    const ticket = await workerA.ok("GET", `${a}/tickets/${ticketId}`);
    assert.equal(ticket.title, "Tractor makes a noise");
    assert.equal(ticket.description, "Tractor makes a noise\nat high revs");
    assert.equal(ticket.reporterId, ids.worker);
    assert.equal(ticket.files.length, 1, "photos move to the ticket");
    const note = (await workerA.ok("GET", `${a}/notes`)).find((n: { id: string }) => n.id === shared);
    assert.equal(note.ticketId, ticketId);
    assert.equal(note.files.length, 0);

    await workerA.ok("DELETE", `${a}/notes/${priv}`);
    assert.ok(!(await workerA.ok("GET", `${a}/notes`)).some((n: { id: string }) => n.id === priv));
  });
});

describe("work time", () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const today = day(0);

  test("a person records one total per day; ticket time is reported next to it", async () => {
    const a = `/api/o/${orgA}`;
    const mine = `${a}/worktime/${ids.worker}`;
    await workerA.ok("PUT", `${mine}/${today}`, { minutes: 480, note: "Barn and field" });
    await workerA.ok("PUT", `${mine}/${today}`, { minutes: 450 });
    const ticket = (await ownerA.ok("POST", `${a}/tickets`, { title: "Timed job", assigneeIds: [ids.worker] })).id;
    await workerA.ok("POST", `${a}/tickets/${ticket}/time`, { minutes: 60, date: today });
    await workerA.ok("POST", `${a}/tickets/${ticket}/time`, { minutes: 30, date: today });

    const got = await workerA.ok("GET", `${a}/worktime?from=${today}&to=${today}`);
    assert.equal(got.days.length, 1, "saving the same day again replaces it");
    assert.deepEqual({ minutes: got.days[0].minutes, note: got.days[0].note, userId: got.days[0].userId, updatedBy: got.days[0].updatedBy }, { minutes: 450, note: null, userId: ids.worker, updatedBy: ids.worker });
    const onTicket = got.ticketTime.filter((t: { ticketId: string }) => t.ticketId === ticket);
    assert.equal(onTicket.length, 1, "ticket time is summed per ticket and day");
    assert.equal(onTicket[0].minutes, 90);
    assert.match(onTicket[0].ticketKey, /^ALP-\d+$/);

    await workerA.ok("DELETE", `${mine}/${today}`);
    assert.equal((await workerA.ok("GET", `${a}/worktime?from=${today}&to=${today}`)).days.length, 0);
  });

  test("employees only see and edit their own hours; managers see and correct everyone's", async () => {
    const a = `/api/o/${orgA}`;
    await workerA.ok("PUT", `${a}/worktime/${ids.worker}/${today}`, { minutes: 480 });
    await adminA.ok("PUT", `${a}/worktime/${ids.admin}/${today}`, { minutes: 300 });

    // employee: the userId filter is ignored, other people's records are unreachable
    const seen = await workerA.ok("GET", `${a}/worktime?from=${today}&to=${today}&userId=${ids.admin}`);
    assert.deepEqual(seen.days.map((d: { userId: string }) => d.userId), [ids.worker]);
    assert.ok(seen.ticketTime.every((t: { userId: string }) => t.userId === ids.worker));
    assert.equal((await workerA.call("PUT", `${a}/worktime/${ids.admin}/${today}`, { minutes: 60 })).status, 404);
    assert.equal((await workerA.call("DELETE", `${a}/worktime/${ids.admin}/${today}`)).status, 404);

    // manager: everyone, or one person
    const all = await adminA.ok("GET", `${a}/worktime?from=${today}&to=${today}`);
    assert.deepEqual(all.days.map((d: { userId: string }) => d.userId).sort(), [ids.worker, ids.admin].sort());
    const one = await ownerA.ok("GET", `${a}/worktime?from=${today}&to=${today}&userId=${ids.worker}`);
    assert.deepEqual(one.days.map((d: { userId: string }) => d.userId), [ids.worker]);

    await adminA.ok("PUT", `${a}/worktime/${ids.worker}/${today}`, { minutes: 420, note: "left early" });
    const corrected = (await workerA.ok("GET", `${a}/worktime?from=${today}&to=${today}`)).days[0];
    assert.deepEqual({ minutes: corrected.minutes, updatedBy: corrected.updatedBy }, { minutes: 420, updatedBy: ids.admin }, "the employee can see who corrected it");
  });

  test("employees can change the current and previous month only; nobody records the future", async () => {
    const a = `/api/o/${orgA}`;
    const firstOfThisMonth = `${today.slice(0, 8)}01`;
    const prev = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 15);
    const inPreviousMonth = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-15`;
    const old = day(-100);

    assert.equal((await workerA.call("PUT", `${a}/worktime/${ids.worker}/${firstOfThisMonth}`, { minutes: 480 })).status, 200);
    assert.equal((await workerA.call("PUT", `${a}/worktime/${ids.worker}/${inPreviousMonth}`, { minutes: 480 })).status, 200);
    const locked = await workerA.call("PUT", `${a}/worktime/${ids.worker}/${old}`, { minutes: 480 });
    assert.equal(locked.status, 403);
    assert.equal(locked.body.error, "worktime_locked");
    assert.equal((await adminA.call("PUT", `${a}/worktime/${ids.worker}/${old}`, { minutes: 480 })).status, 200, "managers can correct any past day");
    assert.equal((await workerA.call("DELETE", `${a}/worktime/${ids.worker}/${old}`)).body.error, "worktime_locked");

    for (const c of [workerA, ownerA]) assert.equal((await c.call("PUT", `${a}/worktime/${ids.worker}/${day(3)}`, { minutes: 60 })).body.error, "future_date");
  });

  test("input is validated and farms are isolated", async () => {
    const a = `/api/o/${orgA}`;
    const mine = `${a}/worktime/${ids.worker}`;
    assert.equal((await workerA.call("PUT", `${mine}/${today}`, { minutes: 0 })).status, 400);
    assert.equal((await workerA.call("PUT", `${mine}/${today}`, { minutes: 24 * 60 + 1 })).body.issues[0].path, "minutes");
    assert.equal((await workerA.call("PUT", `${mine}/2026-02-31`, { minutes: 60 })).status, 400);
    assert.equal((await workerA.call("GET", `${a}/worktime?from=${today}`)).status, 400);
    assert.equal((await ownerA.call("GET", `${a}/worktime?from=2020-01-01&to=${today}`)).status, 400, "range is capped");

    // another farm's owner: no access through farm A, and farm A's people are not addressable through farm B
    assert.equal((await ownerB.call("GET", `${a}/worktime?from=${today}&to=${today}`)).status, 404);
    const viaB = await ownerB.call("PUT", `/api/o/${orgB}/worktime/${ids.worker}/${today}`, { minutes: 60 });
    assert.equal(viaB.status, 404);
    const inB = await ownerB.ok("GET", `/api/o/${orgB}/worktime?from=${day(-120)}&to=${today}`);
    assert.equal(inB.days.length, 0);
    assert.equal(inB.ticketTime.length, 0);
  });
});

describe("vacation and sick leave", () => {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return iso(d);
  };
  /** The Monday `weeks` weeks from now, so ranges have a known shape. */
  const monday = (weeks: number) => {
    const d = new Date();
    d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7) + (weeks - 1) * 7);
    return d;
  };
  const plus = (d: Date, n: number) => {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return iso(c);
  };

  test("a vacation is booked ahead as a range, skips weekends and is visible to the whole team without its note", async () => {
    const a = `/api/o/${orgA}`;
    const start = monday(3);
    const from = iso(start);
    const to = plus(start, 8); // Monday .. Tuesday of the following week
    await ownerA.ok("POST", `${a}/notifications/read`, {});
    const res = await workerA.ok("POST", `${a}/absences`, { userId: ids.worker, kind: "vacation", from, to, note: "Family trip" });
    assert.equal(res.saved.length, 7, "9 calendar days minus one weekend");
    assert.deepEqual(res.skipped, []);
    assert.ok(!res.saved.includes(plus(start, 5)) && !res.saved.includes(plus(start, 6)));

    // the person: full entries, no hours
    const own = await workerA.ok("GET", `${a}/worktime?from=${from}&to=${to}`);
    assert.equal(own.days.length, 7);
    assert.ok(own.days.every((d: { kind: string; minutes: number; note: string }) => d.kind === "vacation" && d.minutes === 0 && d.note === "Family trip"));

    // a colleague (employee): sees the dates, nothing else about them
    const { userId: mateId } = await ownerA.ok("POST", `${a}/members`, { email: "mate@example.com", name: "Mate", password: "password1", role: "employee" });
    const mate = await signIn("mate@example.com");
    const seen = await mate.ok("GET", `${a}/worktime?from=${from}&to=${to}`);
    assert.equal(seen.days.length, 0, "other people's entries stay private");
    assert.equal(seen.absences.length, 7);
    assert.deepEqual(Object.keys(seen.absences[0]).sort(), ["date", "kind", "userId"], "no note for colleagues");
    assert.ok(seen.absences.every((x: { userId: string; kind: string }) => x.userId === ids.worker && x.kind === "vacation"));
    assert.equal((await mate.call("POST", `${a}/absences`, { userId: ids.worker, kind: "vacation", from, to })).status, 404, "cannot book leave for someone else");
    assert.equal((await mate.call("DELETE", `${a}/absences?userId=${ids.worker}&from=${from}&to=${to}`)).status, 404);
    void mateId;

    // owner and admin are told
    const note = (await ownerA.ok("GET", `${a}/notifications`)).find((n: { type: string }) => n.type === "absence");
    assert.deepEqual({ kind: note.data.kind, userId: note.data.userId, from: note.data.from, days: note.data.days, actor: note.actorId }, { kind: "vacation", userId: ids.worker, from, days: 7, actor: ids.worker });
    assert.ok((await adminA.ok("GET", `${a}/notifications`)).some((n: { type: string }) => n.type === "absence"));

    // shorten it: cancel the second week
    const cut = await workerA.ok("DELETE", `${a}/absences?userId=${ids.worker}&from=${plus(start, 7)}&to=${to}`);
    assert.equal(cut.removed, 2);
    assert.equal((await mate.ok("GET", `${a}/worktime?from=${from}&to=${to}`)).absences.length, 5);
  });

  test("sick leave is private to the person and the managers, and may also run into the future", async () => {
    const a = `/api/o/${orgA}`;
    const from = day(0);
    const to = day(2);
    const res = await workerA.ok("POST", `${a}/absences`, { userId: ids.worker, kind: "sick", from, to, weekdaysOnly: false });
    assert.equal(res.saved.length + res.skipped.length, 3);

    const mate = await signIn("mate@example.com");
    const seen = await mate.ok("GET", `${a}/worktime?from=${day(-1)}&to=${day(3)}`);
    assert.ok(!seen.absences.some((x: { kind: string }) => x.kind === "sick"), "colleagues never see sick leave");
    const own = await workerA.ok("GET", `${a}/worktime?from=${day(-1)}&to=${day(3)}`);
    assert.ok(own.absences.some((x: { kind: string; userId: string }) => x.kind === "sick" && x.userId === ids.worker));
    const boss = await ownerA.ok("GET", `${a}/worktime?from=${day(-1)}&to=${day(3)}`);
    assert.ok(boss.absences.some((x: { kind: string; userId: string }) => x.kind === "sick" && x.userId === ids.worker));
    assert.ok(boss.days.some((d: { kind: string; userId: string }) => d.kind === "sick" && d.userId === ids.worker));
    await workerA.ok("DELETE", `${a}/absences?userId=${ids.worker}&from=${from}&to=${to}`);
  });

  test("a range never overwrites recorded hours; a single day can be switched explicitly", async () => {
    const a = `/api/o/${orgA}`;
    const yesterday = day(-1);
    await adminA.ok("DELETE", `${a}/worktime/${ids.admin}/${day(0)}`); // left over from the work-time tests
    await adminA.ok("PUT", `${a}/worktime/${ids.admin}/${yesterday}`, { minutes: 480 });
    const res = await adminA.ok("POST", `${a}/absences`, { userId: ids.admin, kind: "sick", from: yesterday, to: day(1), weekdaysOnly: false });
    assert.deepEqual(res.skipped, [yesterday]);
    assert.equal(res.saved.length, 2);
    let days = (await adminA.ok("GET", `${a}/worktime?from=${yesterday}&to=${day(1)}&userId=${ids.admin}`)).days;
    assert.deepEqual(days.map((d: { kind: string; minutes: number }) => [d.kind, d.minutes]), [["work", 480], ["sick", 0], ["sick", 0]]);

    // explicit single-day change: worked day becomes sick, hours are dropped
    await adminA.ok("PUT", `${a}/worktime/${ids.admin}/${yesterday}`, { kind: "sick", minutes: 480 });
    // cancelling leave leaves working days alone
    await adminA.ok("PUT", `${a}/worktime/${ids.admin}/${day(0)}`, { kind: "work", minutes: 300 });
    assert.equal((await adminA.ok("DELETE", `${a}/absences?userId=${ids.admin}&from=${yesterday}&to=${day(1)}`)).removed, 2);
    days = (await adminA.ok("GET", `${a}/worktime?from=${yesterday}&to=${day(1)}&userId=${ids.admin}`)).days;
    assert.deepEqual(days.map((d: { kind: string; minutes: number; date: string }) => [d.date, d.kind, d.minutes]), [[day(0), "work", 300]]);
  });

  test("rules: hours not in the future, leave at most a year ahead, old months closed for employees, managers act for others", async () => {
    const a = `/api/o/${orgA}`;
    const mine = `${a}/worktime/${ids.worker}`;
    assert.equal((await workerA.call("PUT", `${mine}/${day(5)}`, { kind: "work", minutes: 480 })).body.error, "future_date");
    assert.equal((await workerA.call("PUT", `${mine}/${day(5)}`, { kind: "vacation" })).status, 200);
    assert.equal((await workerA.call("PUT", `${mine}/${day(5)}`, { minutes: 0 })).status, 400, "a working day needs hours");
    assert.equal((await workerA.call("POST", `${a}/absences`, { userId: ids.worker, kind: "vacation", from: day(400), to: day(401), weekdaysOnly: false })).body.error, "too_far_ahead");
    assert.equal((await workerA.call("POST", `${a}/absences`, { userId: ids.worker, kind: "sick", from: day(-100), to: day(-99), weekdaysOnly: false })).body.error, "worktime_locked");
    assert.equal((await adminA.call("POST", `${a}/absences`, { userId: ids.worker, kind: "sick", from: day(-100), to: day(-99), weekdaysOnly: false })).status, 200);
    const saturday = plus(monday(2), 5);
    assert.equal((await workerA.call("POST", `${a}/absences`, { userId: ids.worker, kind: "vacation", from: saturday, to: plus(monday(2), 6) })).body.error, "no_days");

    // a manager books leave for someone: that person is notified
    await workerA.ok("POST", `${a}/notifications/read`, {});
    await ownerA.ok("POST", `${a}/absences`, { userId: ids.worker, kind: "vacation", from: iso(monday(6)), to: iso(monday(6)) });
    const told = (await workerA.ok("GET", `${a}/notifications`)).find((n: { type: string; readAt: string | null }) => n.type === "absence" && !n.readAt);
    assert.equal(told.actorId, ids.owner);

    // other farms: nothing leaks, nothing is reachable
    assert.equal((await ownerB.call("POST", `/api/o/${orgB}/absences`, { userId: ids.worker, kind: "vacation", from: day(1), to: day(1), weekdaysOnly: false })).status, 404);
    assert.equal((await ownerB.ok("GET", `/api/o/${orgB}/worktime?from=${day(-120)}&to=${day(200)}`)).absences.length, 0);
    await workerA.ok("DELETE", `${a}/absences?userId=${ids.worker}&from=${day(0)}&to=${day(60)}`);
  });
});

describe("invitations", () => {
  test("invite link lets a new person join with the invited role, once", async () => {
    const a = `/api/o/${orgA}`;
    const { token } = await adminA.ok("POST", `${a}/invitations`, { role: "employee" });
    assert.equal((await adminA.call("POST", `${a}/invitations`, { role: "owner" })).status, 403);
    const anon = injectClient(app);
    const info = await anon.ok("GET", `/api/invitations/${token}`);
    assert.equal(info.orgName, "Alpha Farm");
    assert.equal(info.role, "employee");
    assert.equal((await anon.call("POST", `/api/invitations/${token}/accept`, { email: "owner-b@example.com", name: "x", password: "password1" })).body.error, "email_taken");
    await anon.ok("POST", `/api/invitations/${token}/accept`, { email: "new@example.com", name: "New Hand", password: "password1" });
    const me = await anon.ok("GET", "/api/me");
    assert.deepEqual(me.memberships.map((m: { orgId: string; role: string }) => [m.orgId, m.role]), [[orgA, "employee"]]);
    assert.equal((await injectClient(app).call("GET", `/api/invitations/${token}`)).body.error, "invite_invalid");

    // an existing user of another farm can accept while signed in and then belongs to both
    const second = await ownerA.ok("POST", `${a}/invitations`, { role: "admin" });
    await ownerB.ok("POST", `/api/invitations/${second.token}/accept`, {});
    const both = await ownerB.ok("GET", "/api/me");
    assert.deepEqual(both.memberships.map((m: { orgId: string }) => m.orgId).sort(), [orgA, orgB].sort());
    assert.equal((await ownerB.ok("GET", `${a}/bootstrap`)).role, "admin");
    assert.equal((await ownerB.ok("GET", `/api/o/${orgB}/bootstrap`)).role, "owner");
  });
});
