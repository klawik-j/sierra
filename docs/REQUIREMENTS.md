# Sierra — Requirements (v0.5)

Status: **MVP implemented** (see §11 for what is built and §10 for the defaults chosen) · Date: 2026-11-25

## 1. Vision

Sierra is a web platform for managing day-to-day work on a farm: who does what, on which machine or building, by when, with photo evidence.

- **Now:** an internal tool for one family farm.
- **Later:** potentially sold as SaaS to other farms. Every architectural decision must assume **many independent farms (tenants)** from day one, even if only one exists at first.

Design goals: visually pleasant, fast, simple enough for non-technical users.

- **The phone is the primary device** — owners and employees use Sierra mostly in the field, in the barn, or next to a machine. Every feature must be fully usable on a phone first.
- **The desktop is a first-class citizen, not an afterthought** — planning, reviewing tickets, and managing the machine park happen at a computer, so wide screens get dedicated, richer layouts (see §5).
- **Talk instead of type** — anywhere you can type longer text, you can dictate it.
- **Tap to act** — phone numbers, emails, and addresses are always actionable (call, write, navigate).

## 2. Glossary

| Term | Meaning |
|---|---|
| Organization (tenant) | One farm/business. All data belongs to exactly one organization. |
| User | A person with a login. Can be a member of one or more organizations. |
| Membership | User ↔ organization link carrying the user's **role** in that organization. |
| Ticket | A unit of work (repair, task, inspection, chore). |
| Asset | Something tickets can relate to. Initially **Machine** and **Building**; designed to be extended (e.g. field/parcel, silo, livestock group). |

## 3. Users and roles

Roles are per organization (a person may be an owner on one farm and an employee on another).

| Role | Intended for | Summary |
|---|---|---|
| **Owner** | Farm owner(s) | Everything, including organization settings, billing (future), deleting the organization, managing admins. |
| **Admin / Manager** | Family member or foreman running daily operations | Manage users (except owners), tickets, assets, categories. |
| **Employee** | Farm worker | Sees tickets assigned to them (and optionally all open tickets), updates status, comments, uploads photos, logs time. Read-only view of assets. |
| **Guest / Contractor** *(optional, later)* | External mechanic, vet, service company | Sees only tickets explicitly shared/assigned to them. |

### 3.1 Permission matrix (initial proposal)

| Action | Owner | Admin | Employee | Guest |
|---|:-:|:-:|:-:|:-:|
| Manage organization settings | ✅ | ❌ | ❌ | ❌ |
| Invite / remove users, change roles | ✅ | ✅ (not owners) | ❌ | ❌ |
| Create / edit / delete assets | ✅ | ✅ | ❌ | ❌ |
| View assets | ✅ | ✅ | ✅ | only linked to their tickets |
| Create tickets | ✅ | ✅ | ✅ (configurable) | ❌ |
| Assign tickets to others | ✅ | ✅ | ❌ (configurable) | ❌ |
| View all tickets | ✅ | ✅ | configurable (own only / all) | own only |
| Update ticket status, comment, add photos, log time | ✅ | ✅ | on tickets they're assigned to / created | on assigned tickets |
| Delete tickets | ✅ | ✅ | ❌ | ❌ |
| See reports / cost data | ✅ | ✅ | ❌ | ❌ |
| Record own working hours (current and previous month) | ✅ | ✅ | ✅ | ❌ |
| Report own vacation or sick leave (also ahead) | ✅ | ✅ | ✅ | ❌ |
| See who is on vacation | ✅ | ✅ | ✅ | ❌ |
| See sick leave of others, notes on leave | ✅ | ✅ | ❌ | ❌ |
| See and correct everyone's working hours, export | ✅ | ✅ | ❌ | ❌ |
| Create notes (own), dictate | ✅ | ✅ | ✅ | ✅ |
| View shared notes | ✅ | ✅ | ✅ | ❌ |
| Manage contacts | ✅ | ✅ | ❌ | ❌ |
| View contacts / tap-to-call | ✅ | ✅ | configurable (all / linked to own tickets) | linked to own tickets |

Permissions are implemented as named capabilities (e.g. `ticket.assign`, `asset.edit`) mapped to roles, so roles can later be customized per tenant without code changes.

## 4. Functional requirements

### 4.1 Organizations & accounts

- FR-1 Sign in with email + password; optional "Sign in with Google".
- FR-2 Owner/admin invites users by email (invite link). Workers without email: admin can create an account with a username + PIN/password.
- FR-3 A user can belong to several organizations and switch between them.
- FR-4 Organization profile: name, logo, address, timezone, language, currency, units (metric).
- FR-5 Password reset; user profile (name, phone, avatar, language).

### 4.2 Tickets (core feature)

Fields:

| Field | Notes |
|---|---|
| Key / number | Human-readable, per organization (e.g. `SRA-42`). |
| Title | Required. |
| Description | Rich-ish text (markdown or simple formatting). |
| Status | Default workflow: **To do → In progress → Blocked / Waiting → Done**, plus **Cancelled**. Admin can rename (later: customize). |
| Priority | Low / Normal / High / Urgent. |
| Category / type | e.g. Repair, Maintenance, Inspection, Field work, Purchase. Configurable per organization. |
| Reporter | Who created it. |
| Assignee(s) | One or more users. |
| Due date | Optional, with "overdue" / "due soon" highlighting. |
| Estimated time | Hours (e.g. `2.5h`). |
| Time spent | Sum of time logs (see FR-T6). |
| Related assets | Zero or more machines and/or buildings. |
| Labels / tags | Free tags. |
| Attachments | Photos (and optionally PDFs). Each photo can be tagged **Before / After / Other**. |
| Comments | Chronological, with photos allowed. |
| History | Audit log of every change (who, when, what changed). |

Behaviour:

- FR-T1 Create, edit, delete (soft delete / trash) tickets.
- FR-T2 Photo upload straight from phone camera; images are resized server-side (thumbnail + preview + original). Before/after photos are shown side by side on the ticket.
- FR-T3 Views: **List** (sortable, filterable), **Board** (Kanban by status, drag & drop), **My tickets**, **Calendar** (by due date).
- FR-T4 Filters: status, assignee, priority, category, asset, due date range, text search. Saved filters (later).
- FR-T5 Comments with @mentions.
- FR-T6 Time logging: worker records time spent (manual entry; start/stop timer later). Compare estimate vs. actual.
- FR-T7 Sub-tasks / checklist inside a ticket (simple checkbox list).
- FR-T8 Notifications (in-app first): assigned to me, mentioned, status changed on my ticket, due soon / overdue. Email / push later.
- FR-T9 *(Phase 2)* Recurring tickets / maintenance schedules — e.g. "Service tractor every 250 engine hours or every 12 months", "Clean barn ventilation every month".

### 4.3 Assets — Machines

- FR-M1 Machine registry: name, type (tractor, combine, car, trailer, sprayer, …), make, model, year, registration plate, VIN/serial number, photo(s), status (Operational / Needs attention / Out of service / Sold), notes.
- FR-M2 Usage counter: engine hours and/or mileage, with manual reading entries (history).
- FR-M3 Important dates: technical inspection, insurance expiry, next service — with reminders.
- FR-M4 Documents: manuals, registration, insurance policy (file attachments).
- FR-M5 Machine detail page shows **all related tickets** (open and history), photos, and a maintenance timeline.
- FR-M6 *(Phase 2)* Cost tracking per machine (parts, service, fuel), from tickets.

### 4.4 Assets — Buildings

- FR-B1 Building registry: name, type (barn, warehouse, garage, house, silo, …), location/address or map pin, area, year built, photo(s), notes.
- FR-B2 Optional sub-locations (rooms/zones, e.g. "Barn A → Ventilation room") so tickets can be precise.
- FR-B3 Building detail page shows related tickets and history.
- FR-B4 *(Phase 2)* Installed equipment within buildings (fans, pumps, heaters) as child assets.

### 4.5 Asset model (generic)

- Machines and buildings are both **assets** sharing a common core (name, type, status, photos, documents, tickets, history) plus type-specific fields.
- New asset kinds (fields/parcels, livestock groups, tools, silos) can be added later without redesigning tickets.
- Assets can be nested (building → room → equipment).

### 4.6 Dashboard

- FR-D1 Per role:
  - Owner/Admin: open tickets by status, overdue tickets, urgent tickets, machines needing attention, upcoming inspections/insurance expiries, recent activity.
  - Employee: my tasks for today / this week, overdue items, quick "new ticket" and "add photo" actions.

### 4.7 Search

- FR-S1 Global search across tickets, machines, buildings, users, contacts, and notes.

### 4.8 Notes & voice dictation

Inspired by Foxtrot: speaking is faster than typing on a phone, especially with dirty hands or gloves.

- FR-N1 **Notes**: quick free-form notes (title optional, body, photos). A note can be private or shared with the organization, and optionally linked to a ticket, machine, building, or contact (e.g. "Tractor makes a noise at high revs — check bearing").
- FR-N2 A note can be **converted into a ticket** with one tap (body → description, links and photos carried over).
- FR-N3 **Dictation everywhere**: every multi-line text field (note body, ticket description, comment, checklist item, contact notes) has a microphone button. Speech is transcribed live and appended to the text, which stays editable.
- FR-N4 Dictation uses the organization's/user's language (Polish by default).
- FR-N5 Implementation (MVP): browser Web Speech API (same as Foxtrot — works in Chrome/Android and Safari/iOS). Where not available, the button is hidden and the phone keyboard's built-in microphone still works.
- FR-N6 *(Phase 2)* **Voice memo**: record audio, store it as an attachment, and transcribe it server-side (e.g. OpenAI Whisper / AWS Transcribe). Works on every browser and keeps the original recording for playback. Useful for long descriptions and for workers who prefer to just leave a message.
- FR-N7 *(Later)* Optional AI clean-up of dictated text (punctuation, splitting into title + description + checklist).

### 4.9 Contacts & tap-to-act

- FR-C1 **Contact directory** per organization: people and companies the farm works with — mechanics, machine dealers, spare-part suppliers, vets, agronomists, insurers, buyers, neighbours. Fields: name, company, role/category, phone(s), email, address, website, notes, tags.
- FR-C2 Contacts can be **linked** to machines (e.g. dealer/service for this tractor, insurer), buildings (e.g. electrician, ventilation installer), and tickets (e.g. external mechanic doing the repair).
- FR-C3 **Tap-to-act** everywhere a value appears (contact card, user profile, building, ticket):
  - phone → `tel:` (dials on phone; on desktop opens the system handler), plus **SMS** (`sms:`) and copy;
  - email → `mailto:` (opens mail app with the address prefilled; from a ticket, subject prefilled with the ticket key/title);
  - address / map pin → opens **Google Maps navigation** (Apple Maps on iOS optional);
  - website → opens in a new tab.
- FR-C4 Team members' phone numbers are also tap-to-call (an employee can call the owner straight from a ticket).
- FR-C5 *(Later)* Import contacts from a phone (vCard) / export a contact as vCard; WhatsApp link.

### 4.10 Work time

The farm needs to know how many hours each person worked per day, week and month, as the basis for pay.

Decisions (2026-11-25): one total per day rather than start/end times; no pay calculation in Sierra (hours only); employees correct their own current and previous month, owner and admin correct anything.

- FR-W1 **Daily total**: each person records one total per calendar day (e.g. `8 h`, `7,5`, `7:30`) with an optional note (dictation available). Saving the same day again replaces the entry. Days in the future cannot be recorded.
- FR-W2 **Tickets that day**: the day shows the tickets the person logged time on that day, with the time per ticket; time can be added to a ticket straight from the day. Ticket time is **independent** of the daily total — the two do not have to add up.
- FR-W3 **Who can change what**: a person adds and corrects their own days for the **current and previous month**; older days are closed. Owner and admin can enter or correct any day for any member, including people who have left. A corrected entry shows who changed it last.
- FR-W4 **Privacy**: employees see only their own hours. Owner and admin see everyone's.
- FR-W5 **Team overview** (owner, admin): hours per person by **day** (list with notes and tickets), **week** and **month** (people × days grid with per-person and per-day totals); any cell opens that person's day for editing; a person opens their month.
- FR-W6 **Own overview**: month by month — total, days worked, this week, time on tickets, and every day with its note and tickets.
- FR-W7 **Export**: the week or month grid downloads as a spreadsheet file (CSV) for payroll.
- FR-W8 **Reach**: today's hours on the dashboard, an entry in the quick-add menu, and a "Work time" section in the navigation.
- *(Later)* hourly rates and pay calculation, overtime / weekend rules, monthly approval and locking, start/end times or a clock-in button, reminders to people who have not logged the day.

### 4.11 Vacation and sick leave

A day is one of three things: **work** (hours), **vacation** or **sick leave**. Leave is chosen in the same place where hours are logged.

Cases this is designed around:

| Real-life case | Consequence |
|---|---|
| Someone books Christmas, 21 Dec – 2 Jan. | Leave is entered as a **from–to range**; Saturdays and Sundays are skipped unless switched off. |
| Someone wakes up ill; the doctor signs them off until Friday. | Sick leave can also cover **future** days; owner and admin are **notified** at once. |
| A day inside the range already has hours logged (worked the morning, then went home ill). | A range **never overwrites recorded hours**: those days are skipped and reported. A single day can be switched explicitly. |
| A trip is cut short, moved, or the person falls ill during it. | Opening any day of a leave period shows the **whole period**; it can be shortened, moved, deleted or changed to the other kind. |
| The owner plans next week's work. | "Who is away" is on the dashboard and the work-time screen; the team grid shows leave on future days. |
| End of month, payroll. | Vacation days and sick days are counted per person next to the hours, per month and per calendar year, and are in the export. |
| A colleague looks at someone's vacation. | They see the dates only — not the note, and never sick leave. |

- FR-L1 **Kinds**: vacation and sick leave. A leave day carries no hours.
- FR-L2 **Range entry**: from–to, with "skip Saturdays and Sundays" on by default; the number of days is shown before saving. Up to one year ahead.
- FR-L3 **Who can enter**: a person for themselves (from the 1st of the previous month onwards, including the future); owner and admin for anyone, any date. Hours (work) still cannot be recorded for a future day.
- FR-L4 **Visibility**: **vacation** dates are visible to the whole team. **Sick leave** is visible only to the person, owner and admin. Notes on leave are visible only to the person, owner and admin.
- FR-L5 **Notifications**: owner and admin are notified when someone reports leave; the person is notified when a manager enters leave for them.
- FR-L6 **Protection of hours**: a range skips days that already have hours and says which; cancelling leave never touches recorded hours.
- FR-L7 **Editing a period**: shorten, extend, move, switch kind, or delete the whole period in one step.
- FR-L8 **Overviews**: "Who is away" list (running and upcoming leave); leave shown in the day list, the week / month grid (`U` vacation, `Ch` sick leave) and a person's month, where planned days are listed too; counts of vacation and sick days per person and period, and per calendar year for one person; export includes the codes and both counts.
- *(Later)* leave requests that need approval, vacation entitlement and remaining balance, half days, other kinds (unpaid, on-demand, childcare), warning when assigning a ticket to someone who is away, e-mail / push notification.

## 5. User experience (mobile + desktop)

Responsive does not just mean "the same page squeezed". Each screen is designed for both form factors.

### 5.1 Phone (primary)

- Bottom navigation bar (Dashboard · Tickets · Assets · Notes · More) reachable with a thumb; a prominent floating **"+"** button for quick add (ticket, note, photo, voice note).
- Large tap targets (≥ 44 px), high contrast readable in sunlight, minimal typing (pickers, chips, dictation, camera).
- Ticket board becomes swipeable status columns or a grouped list; detail screens are single column with sticky action buttons (change status, add photo, comment).
- Camera-first photo flow: take "before" photo → do work → take "after" photo from the same ticket in two taps.
- Installable PWA, full-screen, respects safe areas (notch), works in portrait and landscape.

### 5.2 Desktop / tablet

- Persistent left sidebar navigation + top bar with global search (`Ctrl/⌘ K`) and organization switcher.
- Multi-pane layouts: list on the left, ticket/asset detail on the right (no full page reloads); Kanban board with drag & drop across all status columns.
- Dense, sortable tables with column filters for tickets, machines, contacts; bulk actions (assign, change status).
- Dashboard as a grid of widgets (overdue, urgent, machines needing attention, upcoming inspections, recent activity).
- Keyboard shortcuts for frequent actions (new ticket, search, navigate lists); drag & drop file upload.
- Tablet: hybrid — sidebar collapses, two-pane layouts where width allows.

### 5.3 Visual design

- Clean, modern, calm look (shadcn/ui-style), consistent design system: spacing, typography, colours, icons.
- Light and dark mode.
- Colour coding for status and priority, asset photos/avatars for quick recognition.
- Empty states, skeleton loaders, and friendly confirmations instead of blank screens and spinners.

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-1 **Multi-tenancy** | Every tenant-owned row has `organization_id`; all queries are scoped by it at the data-access layer (no "forgot the WHERE" bugs). Option to add PostgreSQL Row-Level Security as a second line of defence. Files stored under a per-tenant prefix. |
| NFR-2 **Responsive, mobile-primary, desktop first-class** | Every screen is tested on phone (≈360–430 px), tablet, and desktop (≥1280 px) widths. Phone is the primary target; desktop has dedicated layouts (see §5). |
| NFR-3 **PWA** | Installable on phone home screen; camera and microphone access for photos and dictation. *(Later)* offline drafts with sync when signal returns — farms often have poor coverage. |
| NFR-4 **Performance** | Initial load < 2 s on 4G; interactions feel instant (optimistic updates). |
| NFR-5 **i18n** | UI translatable from day one. Polish first, English second. Dates/units per organization. |
| NFR-6 **Security** | Hashed passwords (argon2/bcrypt), HTTP-only session cookies, CSRF protection, rate limiting on auth, upload validation (type/size), server-side permission checks on every endpoint. |
| NFR-7 **Audit** | Ticket and asset changes are recorded (who/when/what). |
| NFR-8 **Backups** | Daily DB backups and versioned file storage. |
| NFR-9 **Cost** | Low running cost for a single farm (target: under ~€10/month), scaling up for SaaS. |
| NFR-10 **Accessibility** | Keyboard navigable, sensible contrast, semantic HTML. |
| NFR-11 **SaaS readiness** | Tenant signup flow, plans/limits (users, storage), billing (Stripe) — **designed for, not built** in MVP. |

## 7. Proposed tech stack

Recommendation: **reuse the Foxtrot stack** (it's the one you like, it's fast, and its deployment/infra already exists and is proven).

| Layer | Choice | Why |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript, Tailwind CSS 4, own component kit in the shadcn style (`clsx` + `tailwind-merge`), TanStack Query, React Router | Snappy SPA, polished accessible components, great mobile UX. Same libraries as Foxtrot, so no new tooling to learn. |
| Backend | Node.js + Fastify 5 + TypeScript | Same as Foxtrot; fast, simple. |
| Validation / shared types | zod in a shared package | One schema for API + UI forms. |
| Database | PostgreSQL + Drizzle ORM (PGlite for zero-setup local dev) | Same as Foxtrot; strong relational model for tickets/assets/tenants. |
| Files | S3 (MinIO / local fs in dev), sharp for thumbnails | Same as Foxtrot. |
| Dictation | Browser Web Speech API (MVP); server-side Whisper / AWS Transcribe for voice memos (Phase 2) | Same as Foxtrot for MVP; zero cost. |
| Auth | Cookie sessions + optional Google sign-in | Same as Foxtrot, extended with memberships/roles. |
| Infra | Terraform on AWS (EC2 + CloudFront + S3), GitHub Actions | Same as Foxtrot; cheap for one tenant. |

Main difference vs. Foxtrot: Foxtrot scopes data by `owner_id` (single user); Sierra scopes by `organization_id` with **memberships + roles + capability checks**.

**Alternative:** Django + Django REST Framework (backend you already know) + the same React frontend. Gives a free admin panel and mature auth/permissions; costs two languages and a less unified codebase. Viable if you prefer to own the backend in Python.

## 8. High-level data model (draft)

```
organizations(id, name, slug, settings…)
users(id, email, name, password_hash, locale…)
memberships(user_id, organization_id, role)
invitations(organization_id, email, role, token, expires_at)

assets(id, organization_id, kind[machine|building|…], parent_id, name, type, status, photo_file_id, notes, created_at…)
   └ details (JSON, validated per kind): make, model, year, plate, vin, inspection/insurance/service due | address, area_m2, year built
meter_readings(asset_id, kind[hours|km], value, recorded_at, recorded_by)

tickets(id, organization_id, number, title, description, status, priority, category_id,
        reporter_id, due_date, estimate_minutes, created_at, updated_at, deleted_at)
ticket_assignees(ticket_id, user_id)
ticket_assets(ticket_id, asset_id)
ticket_checklist_items(ticket_id, text, done, position)
comments(id, ticket_id, author_id, body, created_at)
time_logs(id, ticket_id, user_id, minutes, date, note)
categories(id, organization_id, name, color)
labels / ticket_labels
notes(id, organization_id, author_id, title, body, visibility[private|shared], created_at, updated_at)
contacts(id, organization_id, name, company, category, phones[], email, address, lat, lng, website, notes, tags)
asset_contacts(asset_id, contact_id, role)   -- e.g. "dealer", "electrician"
ticket_contacts(ticket_id, contact_id)
   (notes link directly: notes.ticket_id / asset_id / contact_id)
files(id, organization_id, owner_type, owner_id, tag[before|after|other|audio], storage_key, mime, size…)
work_days(organization_id, user_id, date, kind[work|vacation|sick], minutes, note, updated_by)   -- one row per person and day
activity_log(id, organization_id, entity_type, entity_id, actor_id, action, diff, created_at)
notifications(id, user_id, organization_id, type, payload, read_at)
```

## 9. Release plan

**MVP (Phase 1)** — usable by the family farm:
1. Auth, organization, memberships, roles & permissions, invitations.
2. Machines and buildings (CRUD, photos, detail pages with related tickets).
3. Tickets: all fields above, before/after photos, comments, history, checklist, time logs.
4. List + Board + My tickets views, filters, search.
5. Notes with voice dictation (dictation on all long text fields), note → ticket.
6. Contacts with tap-to-call / SMS / email / navigate, linked to machines, buildings, tickets.
7. Role-based dashboards, in-app notifications.
8. Mobile-primary UI with dedicated desktop layouts, PWA, light/dark mode, Polish/English.
9. Deployment to AWS.

**Phase 2:** recurring maintenance schedules, inspection/insurance reminders via email/push, machine cost tracking, calendar view, voice memos with server-side transcription, offline drafts, sub-locations & child equipment.

**Phase 3 (SaaS):** self-service tenant signup, plans & limits, Stripe billing, custom workflows/fields per tenant, super-admin panel, custom domain, data export.

**Ideas for later:** fields/parcels with map, crop & harvest log, fuel log, spare parts inventory, livestock, weather, reports export (PDF/Excel).

## 10. Open questions

> The MVP was built with the **defaults below**; each is a small change if you decide otherwise.
>
> | # | Default used |
> |---|---|
> | 1 | Polish first, English second; each user picks their language. In Polish a ticket is called "zadanie". |
> | 2, 3 | Owner / Admin / Employee. Employees see all tickets and may report new ones — both are switches in *Settings → Farm*. |
> | 4 | To do → In progress → Blocked → Done (+ Cancelled). No separate "verified" step. |
> | 5 | Sign-in by e-mail + password. People join through an invitation link, or a manager creates the account for them. Username + PIN is not built. |
> | 6 | Manual time entries (hours, date, note). No timer, no payroll. |
> | 9 | Online only. |
> | 10 | In-app notifications only. |
> | 11, 12 | Foxtrot-style TypeScript stack. Not deployed yet. |
> | 14 | Live dictation only (as in Foxtrot). |
> | 15 | Notes are private by default, with a "visible to the whole farm" switch. |
> | 16 | Employees see the whole contact directory. |

1. **Language:** Should the UI be Polish first (and English second)?
2. **Roles:** Are Owner / Admin / Employee (+ later Guest) the right set? Should employees see **all** tickets or only their own?
3. **Ticket creation by employees:** Can workers create tickets (e.g. report a broken machine) or only owners/admins?
4. **Workflow:** Is *To do → In progress → Blocked → Done (+ Cancelled)* enough? Does someone need to **approve/verify** finished work (e.g. *Done → Verified* after checking the "after" photo)?
5. **Accounts for workers:** Do all workers have email addresses / smartphones, or do we need username + PIN logins or a shared device mode?
6. **Time tracking:** Is manual "hours spent" enough, or do you want a start/stop timer? Is time used for payroll?
7. **Machines:** Which fields matter most — engine hours, mileage, inspection, insurance, service intervals? Roughly how many machines and buildings?
8. **Scale:** How many people will use it on the family farm?
9. **Offline:** How good is mobile coverage on the farm — is offline mode needed in the MVP?
10. **Notifications:** In-app only for MVP, or email / push / SMS from the start?
11. **Stack:** OK with the Foxtrot-like TypeScript stack, or prefer the Django backend?
12. **Hosting:** Same AWS setup as Foxtrot (separate account/project), and is a custom domain planned?
13. **Branding:** Is "Sierra" the product name shown in the UI? Any preferred colours/logo?
14. **Voice:** Is live dictation (like Foxtrot) enough for the MVP, or do you also want recorded voice memos (audio kept + transcribed server-side, small per-minute cost)?
15. **Notes:** Should notes be private by default or shared with the whole farm?
16. **Contacts:** Should employees see the full contact directory, or only contacts linked to their tickets?

## 11. Implementation status (MVP)

**Built**

- Accounts: sign-up creates a farm with its owner; sign-in, sign-out, profile, password change; several farms per user with a switcher.
- Team: roles and permissions (capability based, enforced on the server), invitation links, accounts created by a manager, role change, removing access, temporary password set by a manager.
- Tickets: all fields from §4.2, per-farm numbering (`GZD-12`), list and Kanban board (drag & drop), filters, sorting, search, checklist, comments with @mentions, time log vs. estimate, before / after / other photos, PDF attachments, full history, in-app notifications.
- Machines and buildings: registry with photos and cover, details, deadlines (inspection, insurance, service), meter readings (engine hours, km), documents, linked contacts, related open and closed tickets.
- Notes: quick capture, private or shared, photos, link to a machine or building, one-tap "turn into a ticket".
- Work time: one total per person and day with a note, the day's ticket time next to it, own month view, team view by day / week / month, spreadsheet export; employees can change the current and previous month, owner and admin anything.
- Vacation and sick leave: entered as a range (also ahead), never overwriting logged hours; vacation visible to the team, sick leave only to the person and managers; notifications to owner and admin; "who is away" list; shown and counted in the work-time views and the export.
- Dictation on every longer text field (Web Speech API).
- Contacts: directory with tap-to-call / SMS / e-mail / navigate / website, linked to machines, buildings and tickets. Team members' numbers are tap-to-call too.
- Dashboard per role, global search (`Ctrl/⌘ K`), light and dark theme, Polish and English, installable PWA shell.
- Phone layout (bottom bar, quick-add button, full-screen ticket) and desktop layout (sidebar, side drawer, board, inline filters).
- Security: scrypt password hashes, HTTP-only session cookies, CSRF header check, rate-limited sign-in, upload type and size validation, tenant scoping on every query.

**Not built yet** (from §4–§6)

- "Sign in with Google", password reset by e-mail, username + PIN accounts (FR-1, FR-2, FR-5).
- Calendar view and saved filters (FR-T3, FR-T4); due-soon / overdue *notifications* (the dashboard shows them instead) (FR-T8).
- Sub-locations and child equipment in the UI (FR-B2, FR-B4) — the data model already supports nesting.
- Guest / contractor role, trash with restore, custom ticket workflows.
- Offline mode, push / e-mail notifications, recurring maintenance, cost tracking, voice memos (Phase 2).
- Deployment to AWS, backups (NFR-8), PostgreSQL row-level security as a second line of defence (NFR-1).
- Work time and leave extras: pay rates and pay calculation, overtime rules, monthly approval, leave approval and balances, half days, reminders (§4.10 and §4.11 "Later").
- Self-service plans and billing (Phase 3).
