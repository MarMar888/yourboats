# yourboats

Operations app for Squeaky Clean Boats — one place for the owner, manager, and employees to see what's scheduled, what's done, and what needs invoicing. Replaces the Google Sheet + AppSheet setup.

## Stack

- **Next.js** (App Router) — Vercel
- **Supabase** — Postgres + Auth (magic link + password)
- **Drizzle ORM** — type-safe schema and queries
- **Tailwind + shadcn/ui** — component library
- **QuickBooks Online** — invoice delivery and payment (integrated, not replaced)
- **Vercel Cron** — nightly schedule generation + invoice-status sync

## Roles

| Role | What they can do |
|------|-----------------|
| Owner | Everything — full access including financial views, employee management |
| Manager | All jobs across employees, customer/boat CRUD, assign employees, trigger invoices to QBO |
| Employee | Own assigned jobs only — mark complete, leave notes, flag complaints |

## Local setup

1. **Clone and install**

```bash
git clone https://github.com/MarMar888/yourboats.git
cd yourboats
pnpm install
```

2. **Create a Supabase project** at [supabase.com](https://supabase.com). Copy your project URL and keys.

3. **Copy env file and fill in values**

```bash
cp .env.example .env.local
```

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string (Session mode) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` in dev |

4. **Set up the schema**

For local development, push the schema straight from `lib/db/schema.ts`:

```bash
pnpm drizzle-kit push
```

Deployments instead apply the versioned SQL files in `drizzle/` via `pnpm db:migrate`,
which runs automatically as part of the Vercel build (`buildCommand` in `vercel.json`)
**before** the new code serves traffic. Each file is applied once and tracked in a
`_migrations` table, so schema changes can never lag behind the code that queries them.
You can run it by hand too:

```bash
pnpm tsx --env-file=.env.local scripts/migrate.ts
```

5. **Run**

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/login`.

## Project structure

```
app/
  (auth)/login/       # Login page + server actions
  (app)/              # Authenticated shell (layout with nav)
    dashboard/        # Today's job cards
    schedule/         # Week/month view
    customers/        # Customer + boat management
    invoices/         # Ready-to-invoice queue + QBO push
    complaints/       # Complaint log
    team/             # Employee management (owner only)
  auth/callback/      # Supabase magic-link callback
lib/
  db/
    schema.ts         # Full Drizzle schema (all 8 tables)
    index.ts          # DB client
  supabase/
    client.ts         # Browser Supabase client
    server.ts         # Server-side Supabase client
middleware.ts         # Auth guard — redirects unauthenticated requests to /login
```

## Data model (summary)

`users` → `service_assignments` → `services` → `service_boats` → `boats` → `customers`

`customers` → `recurring_schedules` (auto-generates `services` rows)

`services` → `invoices` (pushed to QBO on manager approval)

`services` → `complaints` (manager bonus tracking)

See [`lib/db/schema.ts`](lib/db/schema.ts) for the full schema with all fields and relations.

## Phased scope

**v1 (current):** Auth + roles, customers + boats, schedule engine, daily job card view, complete → invoice to QBO, complaints tracking, per-customer notes.

**v1.5:** Tip capture, employee tiers + commission %, multi-employee share splits, pay period reports.

**v2:** Photo uploads, automated customer reminders, route planning.

## QuickBooks integration

OAuth 2.0, one-time auth by the owner. yourboats pushes customers and invoices to QBO; QBO is the source of truth for billing. A nightly Vercel Cron job pulls invoice statuses back.
