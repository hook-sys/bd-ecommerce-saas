# BD Commerce SaaS

Multi-tenant e-commerce SaaS platform for Bangladesh merchants. See
[ARCHITECTURE.md](./ARCHITECTURE.md) for the system design and
[DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md) for non-negotiable rules when
contributing.

## Setup

1. Copy `.env.example` to `.env` and fill in a real Supabase project's
   connection string and keys.
2. Install dependencies: `npm install`
3. Apply the schema to your database: `npm run db:migrate`
4. Seed reference data (plans + features): `npm run db:seed`
5. Start the dev server: `npm run dev`

The platform runs on `http://localhost:3000` (or whatever `PLATFORM_ROOT_DOMAIN`
is set to). Tenant stores resolve from a subdomain of that root domain, e.g.
`rahim.localhost:3000` once a tenant with slug `rahim` exists (add an entry to
your hosts file, or test via the `Host` header directly, since `*.localhost`
subdomains aren't resolvable everywhere without one).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the Vitest suite |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:migrate` | Apply schema changes (dev) |
| `npm run db:seed` | Seed plans + features |
