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

## Deployment (AWS)

Same shape as Foxtrot: one small server behind CloudFront.

```mermaid
flowchart LR
    browser([Browser]) -- HTTPS --> cf[CloudFront]
    cf -- "HTTP :3001<br/>(CloudFront prefix list only)" --> ec2["EC2 t4g.nano<br/>Node.js + PostgreSQL"]
    ec2 --> ebs[("EBS gp3 data volume<br/>daily snapshots (DLM)")]
    ec2 --> s3[("S3 files bucket")]
    deploy[scripts/deploy.sh] -- release.tgz --> rel[("S3 releases bucket")]
    deploy -- SSM Run Command --> ec2
```

| Component | Choice |
|---|---|
| Region | `eu-central-1`, default VPC |
| Compute | EC2 `t4g.nano` (arm64, AL2023), 1 GiB swap, Elastic IP; process clock in `Europe/Warsaw` (work-time rules follow it) |
| Database | PostgreSQL on a separate encrypted gp3 volume (`prevent_destroy`), 7 daily DLM snapshots |
| Files | private S3 bucket, versioned, noncurrent versions expire after 30 days |
| Edge | CloudFront default certificate, `PriceClass_100`, `/assets/*` cached, everything else pass-through |
| Access | no SSH; SSM Session Manager / Run Command; IMDSv2 required |
| IaC | Terraform in `infra/` (+ `infra/bootstrap/` for CI roles), state in `s3://static-sites-terraform-state-<account>/sierra/` |

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
terraform -chdir=infra init \
  -backend-config="bucket=static-sites-terraform-state-${ACCOUNT_ID}" \
  -backend-config="key=sierra/terraform.tfstate" \
  -backend-config="region=eu-central-1" \
  -backend-config="encrypt=true" \
  -backend-config="use_lockfile=true"
terraform -chdir=infra apply           # infrastructure (first boot provisioning ~15 min)
npm run deploy                         # build, upload, install via SSM
# normally both run in CI on merge to master (see CI/CD)
ALLOW_SIGNUP=false npm run deploy      # close public sign-up ("true" reopens it)
SEED_PASSWORD=... npm run deploy       # additionally create the demo farm
terraform -chdir=infra output url
```

**Sign-up.** A fresh deployment lets anyone with the address create a farm. Create yours at `/register`, then close sign-up: set the repository variable `ALLOW_SIGNUP` to `false` (applied on the next deploy) or run `ALLOW_SIGNUP=false npm run deploy`. People still join existing farms through invitation links.

Shell on the instance: `aws ssm start-session --target $(terraform -chdir=infra output -raw instance_id)`.
Logs: `journalctl -u sierra`. Settings: `/etc/sierra.env`.

### CI/CD

| Workflow | Trigger | Role |
|---|---|---|
| `.github/workflows/plan.yaml` | pull request: typecheck, test, build, `terraform plan` posted as a comment | `sierra-gha-plan`: `ReadOnlyAccess` + state |
| `.github/workflows/deploy.yaml` | push to `master`, manual: typecheck, test, `terraform apply`, deploy, CloudFront invalidation | `sierra-gha-deploy`: scoped to `sierra-*` resources |

No long-lived AWS keys; roles are created by [`infra/bootstrap`](infra/bootstrap/README.md). Repository variables: `AWS_DEPLOY_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`, `AWS_REGION`, `TF_STATE_BUCKET`, `ALLOW_SIGNUP`.

Running cost is the same as Foxtrot's: about $8.3 a month (EC2 `t4g.nano`, public IPv4, EBS, snapshots; CloudFront within the free tier), excluding VAT.

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
| `deploy` | build and deploy to AWS (`scripts/deploy.sh`) |

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
infra            Terraform (AWS), instance bootstrap, release installer
infra/bootstrap  GitHub OIDC roles for CI (applied by hand)
.github          plan (PR) and deploy (master) workflows
scripts          deploy.sh
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
