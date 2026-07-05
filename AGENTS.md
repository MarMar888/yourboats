# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**yourboats** is a Next.js 16 (App Router) operations management app for a boat cleaning business. It uses Neon Serverless Postgres, Drizzle ORM, Tailwind CSS, and shadcn/ui.

### Quick reference

| Task | Command |
|---|---|
| Install deps | `pnpm install` |
| Dev server | `pnpm dev` (port 3000) |
| Lint | `npx eslint . --ext .ts,.tsx,.js,.jsx` |
| Tests | `pnpm test` |
| DB push (local dev) | `pnpm db:push` |
| DB migrate (deploy) | `pnpm db:migrate` — applies `drizzle/*.sql`; runs in the Vercel build before traffic |
| Seed | `pnpm seed` |

### Key caveats

- **Next.js 16 removed `next lint`**. The `pnpm lint` script (`next lint`) no longer works. Run ESLint directly with `npx eslint . --ext .ts,.tsx,.js,.jsx` instead.
- **Dev auth bypass**: Set `NEXT_PUBLIC_DEV_AUTH=true` in `.env.local` to skip Neon Auth and use the cookie-based `/pick-user` page with three hardcoded dev users (Owner, Manager, Employee).
- **Database requirement**: The app uses `@neondatabase/serverless` HTTP driver, which requires a real Neon Postgres `DATABASE_URL`. A local PostgreSQL instance will **not** work — the driver sends SQL-over-HTTP to Neon's API endpoint. Without `DATABASE_URL`, the dev server starts but pages that query the database will error.
- **Pre-existing lint issues**: The codebase has ~27 ESLint errors related to `@typescript-eslint/no-explicit-any` rule references without the plugin installed. These are pre-existing.
- **Tests mock the database**: The Vitest test suite (`__tests__/`) mocks `@/lib/db`, so tests run without a database connection.
- **`middleware.ts` deprecation warning**: Next.js 16 emits a warning that the `middleware` file convention is deprecated in favor of `proxy`. This is cosmetic and does not affect functionality.
