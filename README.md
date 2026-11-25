# Sierra

Web app (PWA) for running a farm: tickets (who does what, by when, with before/after photos), working hours, vacations and sick leave per person, the machine park, buildings, notes you can dictate, and contacts you can call with one tap.

Built for one family farm, structured for many: every farm is a separate organization (tenant), so it can later be offered as a service. Phone first, with dedicated desktop layouts. UI in Polish and English.

Status: **MVP**. Requirements, decisions and what is not built yet: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## Run

Requires Node.js ≥ 22. No Docker needed: the database is an embedded PostgreSQL (PGlite) and files go to local disk.

```bash
npm install
cp .env.example .env
npm run db:seed         # fictional demo farm
npm run dev             # web http://localhost:5174, API :3002
```

Demo accounts (password `demo1234`):

| E-mail | Role |
|---|---|
| `demo@example.com` | Owner |
| `anna@example.com` | Admin |
| `piotr@example.com`, `marek@example.com` | Employee |

Or open `/register` to start an empty farm of your own.

To try it on a phone, open `http://<your-computer-ip>:5174` on the same Wi-Fi. Dictation and "install to home screen" need HTTPS, so they only work on `localhost` until the app is deployed.

PGlite is single-process: run `db:seed` / `db:reset` with the API stopped.

### Postgres + MinIO (optional)

```bash
npm run infra:up        # postgres:17 + minio
# .env:
# DATABASE_URL=postgres://sierra:sierra@localhost:54330/sierra
# STORAGE_DRIVER=s3
npm run dev
```

### Production build

```bash
npm run build           # apps/web/dist + apps/api/dist
npm start               # one process: the API also serves the web app on :3002
```

Migrations run on API startup. Set `NODE_ENV=production` (secure cookies) and `ALLOW_SIGNUP=false` if strangers should not be able to create farms.

## Scripts

| Script | Description |
|---|---|
| `dev` | API (tsx watch) + web (Vite) |
| `build` / `start` | production build / run |
| `typecheck` | `tsc` in all workspaces |
| `test` | API tests (in-memory database): tenant isolation, roles, ticket workflow, work time and leave, uploads |
| `db:seed` / `db:reset` | create / recreate the demo farm |
| `db:generate` | new migration after editing `apps/api/src/db/schema.ts` |
| `infra:up` / `infra:down` | docker-compose Postgres + MinIO |

## Stack

| Layer | Choice |
|---|---|
| Web | React 19, Vite, Tailwind CSS 4, TanStack Query, React Router |
| API | Node.js, Fastify 5, TypeScript |
| Shared | zod schemas, API types, permission rules (`packages/shared`) |
| DB | PostgreSQL via PGlite (embedded) or a real server; Drizzle ORM |
| Files | local disk or S3 / MinIO; `sharp` makes previews and thumbnails |

```
apps/api         Fastify REST API, migrations (apps/api/drizzle), seed, tests
apps/web         React SPA / PWA
packages/shared  enums, permissions, validation schemas, API types
docs             requirements
```

## How it is put together

**Tenancy.** Every farm-owned table has `org_id`. All farm data lives under `/api/o/:orgId/…`; a hook resolves the caller's active membership for that farm before any handler runs (non-members get 404), and every query filters on `org_id`. References sent by the client (assignees, machines, contacts, categories) are checked to belong to the same farm. Files are stored under `<orgId>/<fileId>/` and inherit the access rules of the ticket, asset or note they are attached to.

**Permissions.** Roles (`owner`, `admin`, `employee`) map to named capabilities in [`packages/shared/src/permissions.ts`](packages/shared/src/permissions.ts). The API enforces them; the web app uses the same functions to hide what a user cannot do. Two farm settings change what employees may do: see all tickets, and report tickets.

| | Owner | Admin | Employee |
|---|:-:|:-:|:-:|
| Farm settings | ✅ | | |
| Team, machines, buildings, contacts, categories | ✅ | ✅ | view |
| Create tickets | ✅ | ✅ | setting |
| See all tickets | ✅ | ✅ | setting (else: reported by / assigned to them) |
| Edit any ticket, assign people, delete | ✅ | ✅ | own reports; may take a ticket themselves |
| Status, checklist, photos, time on a ticket | ✅ | ✅ | when assigned or reporter |
| Comment | ✅ | ✅ | on any ticket they can see |
| Working hours | everyone's, any date | everyone's, any date | own only; current and previous month |
| Vacation, sick leave | enter for anyone; see all | enter for anyone; see all | enter own (also ahead); see everyone's vacation dates, never others' sick leave |

**Web app.** Server data is cached per farm (`["org", orgId, …]` query keys). A ticket opens in a drawer driven by `?t=<id>`, so it works on top of any screen and as a deep link. Create/edit dialogs live in one provider (`features/forms.tsx`). Texts are in `apps/web/src/i18n/{pl,en}.ts`; design tokens (colours, radii, light/dark) in `apps/web/src/index.css`.

## API

All under `/api`. Mutating requests need the `X-Requested-With` header (CSRF protection); the web client adds it.

| Method | Path | |
|---|---|---|
| POST | `/auth/register`, `/auth/login`, `/auth/logout` | cookie session; register also creates a farm |
| GET, PATCH | `/me` · POST `/me/password` | profile, memberships |
| POST | `/orgs` | start another farm |
| GET, POST | `/invitations/:token`, `/invitations/:token/accept` | public; the token is the secret |
| GET | `/o/:orgId/bootstrap` | farm, own role, members, categories |
| PATCH | `/o/:orgId` | farm settings |
| | `/o/:orgId/members`, `/invitations`, `/categories` | team and reference data |
| | `/o/:orgId/tickets` (+ `/:id/comments`, `/checklist`, `/time`) | tickets |
| | `/o/:orgId/assets` (+ `/:id/readings`, `/contacts/:contactId`, `/cover`) | machines and buildings |
| | `/o/:orgId/contacts`, `/notes` (+ `/:id/convert`) | contacts, notes |
| GET | `/o/:orgId/worktime?from&to[&userId]` | daily records + time per ticket for a date range, plus who is away across the team |
| PUT, DELETE | `/o/:orgId/worktime/:userId/:date` | one person's day: hours, or `kind: vacation \| sick` |
| POST, DELETE | `/o/:orgId/absences` | vacation / sick leave over a from–to range (skips days with logged hours); cancel a range |
| POST, GET, PATCH, DELETE | `/o/:orgId/files`, `/files/:id/thumb\|preview\|original\|download` | uploads (photos, PDF; max 25 MB) |
| GET | `/o/:orgId/activity`, `/notifications` · POST `/notifications/read` | history feed, in-app notifications |
| GET | `/health` | |
