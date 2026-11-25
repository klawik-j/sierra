import { eq, inArray } from "drizzle-orm";
import { buildApp } from "../app.js";
import { injectClient } from "../lib/inject-client.js";
import { createOrganization, createUser } from "../lib/orgs.js";
import { db, dbKind, migrate } from "./client.js";
import { memberships, organizations, users } from "./schema.js";

/**
 * Demo farm with fictional data. `--reset` removes the demo farm and accounts first.
 * Password comes from SEED_PASSWORD (default: demo1234).
 */
const PASSWORD = process.env.SEED_PASSWORD || "demo1234";
const OWNER = "demo@example.com";
const PEOPLE = [
  { email: "anna@example.com", name: "Anna Kowalska", role: "admin", phone: "+48 601 200 300" },
  { email: "piotr@example.com", name: "Piotr Nowak", role: "employee", phone: "+48 602 300 400" },
  { email: "marek@example.com", name: "Marek Wiśniewski", role: "employee", phone: "+48 603 400 500" },
] as const;

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

await migrate();
process.env.LOG_LEVEL ??= "warn";

const emails = [OWNER, ...PEOPLE.map((p) => p.email)];
const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, OWNER));
if (existing) {
  if (!process.argv.includes("--reset")) {
    console.log(`Demo data already present (${OWNER}). Use "npm run db:reset" to recreate it.`);
    process.exit(0);
  }
  const owned = await db.select({ orgId: memberships.orgId }).from(memberships).where(eq(memberships.userId, existing.id));
  if (owned.length) await db.delete(organizations).where(inArray(organizations.id, owned.map((o) => o.orgId)));
  await db.delete(users).where(inArray(users.email, emails));
}

const ownerId = await createUser(db, { email: OWNER, name: "Jan Kowalski", password: PASSWORD, phone: "+48 600 100 200", locale: "pl" });
const orgId = await createOrganization(db, { name: "Gospodarstwo Zielona Dolina", ownerId, locale: "pl" });
await db.update(organizations).set({ ticketPrefix: "GZD", address: "Zielona Dolina 12, 62-200 Gniezno", phone: "+48 600 100 200" }).where(eq(organizations.id, orgId));

const app = await buildApp();
const api = injectClient(app);
const o = `/api/o/${orgId}`;
await api.ok("POST", "/api/auth/login", { email: OWNER, password: PASSWORD });

const member: Record<string, string> = { jan: ownerId };
for (const p of PEOPLE) member[p.name.split(" ")[0].toLowerCase()] = (await api.ok("POST", `${o}/members`, { ...p, password: PASSWORD })).userId;

const boot = await api.ok("GET", `${o}/bootstrap`);
const cat = Object.fromEntries(boot.categories.map((c: { name: string; id: string }) => [c.name, c.id]));

const asset = async (kind: string, name: string, type: string, details: object = {}, extra: object = {}) =>
  (await api.ok("POST", `${o}/assets`, { kind, name, type, details, ...extra })).id as string;

const deere = await asset("machine", "John Deere 6155R", "tractor", { make: "John Deere", model: "6155R", year: 2019, plate: "PGN 4T21", vin: "1L06155RJKG912345", inspectionDue: day(21), insuranceDue: day(64), serviceDue: day(9) });
const ursus = await asset("machine", "Ursus C-360", "tractor", { make: "Ursus", model: "C-360", year: 1984, plate: "PGN 81KX", inspectionDue: day(-6), insuranceDue: day(120) }, { status: "attention", notes: "Stary, ale niezawodny. Używany głównie do lekkich prac przy oborze." });
const claas = await asset("machine", "Claas Lexion 760", "combine", { make: "Claas", model: "Lexion 760", year: 2016, insuranceDue: day(200), serviceDue: day(150) });
const hilux = await asset("machine", "Toyota Hilux", "car", { make: "Toyota", model: "Hilux 2.4 D-4D", year: 2021, plate: "PGN 7H001", inspectionDue: day(88), insuranceDue: day(33) });
const pronar = await asset("machine", "Przyczepa Pronar T672", "trailer", { make: "Pronar", model: "T672", year: 2014, plate: "PGN 55PR", inspectionDue: day(240) });
const amazone = await asset("machine", "Opryskiwacz Amazone UF 1201", "sprayer", { make: "Amazone", model: "UF 1201", year: 2018 }, { status: "out_of_service", notes: "Czeka na nową pompę." });
const obora = await asset("building", "Obora A", "cowshed", { address: "Zielona Dolina 12, 62-200 Gniezno", areaM2: 820, year: 2008 });
const stodola = await asset("building", "Stodoła", "barn", { address: "Zielona Dolina 12, 62-200 Gniezno", areaM2: 400, year: 1996 });
const magazyn = await asset("building", "Magazyn zbożowy", "warehouse", { address: "Zielona Dolina 14, 62-200 Gniezno", areaM2: 650, year: 2015 });
const garaz = await asset("building", "Garaż maszyn", "garage", { areaM2: 520, year: 2012 });
await asset("building", "Warsztat", "workshop", { areaM2: 90, year: 2012 });

for (const [id, kind, value, off] of [
  [deere, "hours", 4210, -60],
  [deere, "hours", 4388, -2],
  [ursus, "hours", 9120, -30],
  [claas, "hours", 1875, -90],
  [hilux, "km", 68400, -14],
] as const) {
  await api.ok("POST", `${o}/assets/${id}/readings`, { kind, value, recordedAt: day(off) });
}

const contact = async (c: object) => (await api.ok("POST", `${o}/contacts`, c)).id as string;
const serwis = await contact({ name: "Tomasz Zieliński", company: "Agro-Serwis Zieliński", category: "mechanic", phone: "+48 604 111 222", email: "serwis@agro-zielinski.example", address: "ul. Polna 4, 62-200 Gniezno", notes: "Dojeżdża na miejsce. Najlepiej dzwonić przed 8:00." });
const dealer = await contact({ name: "Katarzyna Lis", company: "John Deere – Agro-Partner", category: "dealer", phone: "+48 61 555 01 02", email: "k.lis@agro-partner.example", address: "ul. Poznańska 120, 62-300 Września", website: "https://agro-partner.example" });
const vet = await contact({ name: "lek. wet. Paweł Maj", company: "Gabinet Weterynaryjny Maj", category: "vet", phone: "+48 605 222 333", phone2: "+48 61 555 03 04", address: "ul. Lipowa 9, 62-200 Gniezno" });
await contact({ name: "Ewa Dąbrowska", company: "Ubezpieczenia Rolne", category: "insurer", phone: "+48 606 333 444", email: "ewa@ubezpieczenia-rolne.example" });
const elektryk = await contact({ name: "Zbigniew Wójcik", company: "Elektro-Wójcik", category: "contractor", phone: "+48 607 444 555", notes: "Instalacje i wentylacja w budynkach inwentarskich." });
await contact({ name: "Hurtownia Rolnik", category: "supplier", phone: "+48 61 555 05 06", email: "zamowienia@hurtownia-rolnik.example", address: "ul. Składowa 2, 62-200 Gniezno" });

await api.ok("PUT", `${o}/assets/${deere}/contacts/${dealer}`, { role: "Dealer i serwis gwarancyjny" });
await api.ok("PUT", `${o}/assets/${ursus}/contacts/${serwis}`, { role: "Mechanik" });
await api.ok("PUT", `${o}/assets/${amazone}/contacts/${serwis}`, { role: "Mechanik" });
await api.ok("PUT", `${o}/assets/${obora}/contacts/${elektryk}`, { role: "Elektryk / wentylacja" });
await api.ok("PUT", `${o}/assets/${obora}/contacts/${vet}`, { role: "Weterynarz" });

const ticket = async (t: Record<string, unknown>) => (await api.ok("POST", `${o}/tickets`, t)).id as string;
const { jan, anna, piotr, marek } = member;

const fans = await ticket({
  title: "Wentylatory w oborze A – dwa nie działają",
  description: "Wentylatory nr 3 i 5 od strony wschodniej nie startują. Sprawdzić bezpieczniki i silniki. W razie potrzeby wezwać elektryka.",
  priority: "urgent",
  status: "in_progress",
  categoryId: cat["Naprawa"],
  assigneeIds: [piotr],
  assetIds: [obora],
  contactIds: [elektryk],
  dueDate: day(1),
  estimateMinutes: 180,
  labels: ["wentylacja"],
  checklist: ["Sprawdzić bezpieczniki w rozdzielni", "Zmierzyć napięcie na silnikach", "Wymienić uszkodzony kondensator", "Zrobić zdjęcie po naprawie"],
});
const service = await ticket({
  title: "Przegląd okresowy John Deere 6155R (4500 mth)",
  description: "Wymiana oleju silnikowego, filtrów oleju, paliwa i powietrza. Sprawdzić luz zaworowy.",
  priority: "high",
  categoryId: cat["Konserwacja"],
  assigneeIds: [marek],
  assetIds: [deere],
  contactIds: [dealer],
  dueDate: day(9),
  estimateMinutes: 240,
  checklist: ["Zamówić filtry", "Wymienić olej silnikowy", "Wymienić filtry", "Wpisać przegląd do książki serwisowej"],
});
await ticket({ title: "Badanie techniczne Ursusa C-360", description: "Termin minął – umówić stację diagnostyczną.", priority: "high", categoryId: cat["Przegląd"], assigneeIds: [anna], assetIds: [ursus], dueDate: day(-6) });
const pump = await ticket({ title: "Wymiana pompy w opryskiwaczu Amazone", description: "Pompa cieknie na uszczelnieniu. Część zamówiona u mechanika.", priority: "normal", status: "blocked", categoryId: cat["Naprawa"], assigneeIds: [marek], assetIds: [amazone], contactIds: [serwis], dueDate: day(5), estimateMinutes: 120 });
await ticket({ title: "Naprawić dach stodoły po wichurze", description: "Zerwane trzy arkusze blachy od strony północnej.", priority: "high", categoryId: cat["Naprawa"], assigneeIds: [piotr, marek], assetIds: [stodola], dueDate: day(3), estimateMinutes: 360 });
await ticket({ title: "Zamówić olej hydrauliczny 200 l", priority: "low", categoryId: cat["Zakup"], assigneeIds: [anna], dueDate: day(12) });
await ticket({ title: "Orka pola za lasem (12 ha)", description: "Po zbiorze kukurydzy. Głębokość 25 cm.", priority: "normal", categoryId: cat["Prace polowe"], assigneeIds: [marek], assetIds: [deere], dueDate: day(6), estimateMinutes: 600 });
await ticket({ title: "Uszczelnić bramę w magazynie zbożowym", priority: "normal", categoryId: cat["Konserwacja"], assetIds: [magazyn], dueDate: day(20), estimateMinutes: 90 });
const lights = await ticket({ title: "Wymiana oświetlenia w garażu na LED", description: "12 opraw. Stare świetlówki do utylizacji.", priority: "low", categoryId: cat["Konserwacja"], assigneeIds: [piotr], assetIds: [garaz], estimateMinutes: 300 });
const tyres = await ticket({ title: "Wymiana opon w przyczepie Pronar", priority: "normal", categoryId: cat["Naprawa"], assigneeIds: [marek], assetIds: [pronar], dueDate: day(-3), estimateMinutes: 120 });
await ticket({ title: "Ubezpieczenie Hiluxa – odnowić polisę", priority: "normal", categoryId: cat["Inne"], assigneeIds: [jan], assetIds: [hilux], dueDate: day(30) });
await ticket({ title: "Czyszczenie kombajnu po żniwach", priority: "low", status: "cancelled", categoryId: cat["Konserwacja"], assetIds: [claas] });

// A bit of life: work done by employees.
const as = async (email: string) => {
  const c = injectClient(app);
  await c.ok("POST", "/api/auth/login", { email, password: PASSWORD });
  return c;
};
const piotrApi = await as("piotr@example.com");
const marekApi = await as("marek@example.com");

const detail = await api.ok("GET", `${o}/tickets/${fans}`);
await piotrApi.ok("PATCH", `${o}/tickets/${fans}/checklist/${detail.checklist[0].id}`, { done: true });
await piotrApi.ok("PATCH", `${o}/tickets/${fans}/checklist/${detail.checklist[1].id}`, { done: true });
await piotrApi.ok("POST", `${o}/tickets/${fans}/comments`, { body: "Bezpieczniki całe. W wentylatorze nr 3 padł kondensator, nr 5 ma zatarte łożysko – potrzebny nowy silnik." });
await api.ok("POST", `${o}/tickets/${fans}/comments`, { body: "@Piotr Nowak dzięki. Zadzwoń do elektryka, niech przywiezie silnik jutro rano." });
await piotrApi.ok("POST", `${o}/tickets/${fans}/time`, { minutes: 75, date: day(0), note: "Diagnoza" });

await marekApi.ok("POST", `${o}/tickets/${pump}/comments`, { body: "Czekamy na pompę, mechanik obiecał dostawę w piątek." });
await marekApi.ok("PATCH", `${o}/tickets/${tyres}`, { status: "done" });
await marekApi.ok("POST", `${o}/tickets/${tyres}/time`, { minutes: 110, date: day(-3) });
await marekApi.ok("POST", `${o}/tickets/${tyres}/comments`, { body: "Opony wymienione, stare zostawiłem pod wiatą." });
await piotrApi.ok("PATCH", `${o}/tickets/${lights}`, { status: "in_progress" });
await piotrApi.ok("POST", `${o}/tickets/${lights}/time`, { minutes: 120, date: day(-1), note: "Pierwsze 5 opraw" });
await marekApi.ok("PATCH", `${o}/tickets/${service}/checklist/${(await api.ok("GET", `${o}/tickets/${service}`)).checklist[0].id}`, { done: true });

// Daily hours for the last four weeks (weekdays, a few Saturdays), each recorded by the person themselves.
const hours: Record<string, number[]> = { piotr: [480, 480, 510, 450, 480, 540, 480], marek: [480, 420, 480, 600, 480, 480, 360], anna: [360, 480, 480, 420, 480] };
const dayNotes = ["Obora i karmienie", "Prace w warsztacie", "Pole za lasem", "", "", "Naprawy", ""];
const own: Record<string, ReturnType<typeof injectClient>> = { piotr: piotrApi, marek: marekApi, anna: await as("anna@example.com") };
for (const [who, pattern] of Object.entries(hours)) {
  for (let offset = -28, i = 0; offset <= (who === "piotr" ? 0 : -1); offset++) {
    const weekday = new Date(Date.now() + offset * 864e5).getDay();
    if (weekday === 0 || (weekday === 6 && (who === "anna" || offset % 14 !== 0))) continue;
    const minutes = weekday === 6 ? 300 : pattern[i % pattern.length];
    await own[who].ok("PUT", `${o}/worktime/${member[who]}/${day(offset)}`, { minutes, note: who === "anna" ? "" : dayNotes[i % dayNotes.length] });
    i++;
  }
}

// Leave: a vacation booked a few weeks ahead (the whole team sees it) and two sick days last week (managers only).
await own.piotr.ok("POST", `${o}/absences`, { userId: member.piotr, kind: "vacation", from: day(26), to: day(37), note: "Wyjazd w góry" });
for (const offset of [-9, -8, -7, -6]) {
  const weekday = new Date(Date.now() + offset * 864e5).getDay();
  if (weekday !== 0 && weekday !== 6) await own.marek.ok("PUT", `${o}/worktime/${member.marek}/${day(offset)}`, { kind: "sick", note: "Zwolnienie lekarskie" });
}

await api.ok("POST", `${o}/notes`, { title: "Do omówienia z Anną", body: "Plan zasiewów na wiosnę.\nCzy bierzemy drugą przyczepę na żniwa?\nUrlopy pracowników w lipcu.", shared: false });
await api.ok("POST", `${o}/notes`, { title: "Kody do bramy i alarmu", body: "Brama główna: pilot w biurze, zapasowy u Anny.\nAlarm w magazynie uzbraja się automatycznie o 22:00.", shared: true });
await piotrApi.ok("POST", `${o}/notes`, { body: "Ursus przy wyższych obrotach stuka z przodu po lewej – sprawdzić łożysko koła.", shared: true, assetId: ursus });

await app.close();
console.log(`Seeded demo farm (${dbKind}). Sign in: ${OWNER} / ${PASSWORD}`);
console.log(`Other accounts (same password): ${PEOPLE.map((p) => `${p.email} [${p.role}]`).join(", ")}`);
process.exit(0);
