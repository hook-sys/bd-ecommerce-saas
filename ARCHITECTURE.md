# Architecture — Phase 1 Foundation

A multi-tenant e-commerce SaaS platform for Bangladesh merchants. One codebase, one
application, one Postgres database — hundreds of independent stores, each isolated
by `tenantId`, each reachable on its own subdomain.

## Stack

| Layer      | Choice                                      |
|------------|----------------------------------------------|
| Frontend   | Next.js (App Router), TypeScript, Tailwind, shadcn/ui |
| Backend    | Next.js Route Handlers + Server Components, service/repository layers |
| Database   | PostgreSQL |
| ORM        | Prisma (v6 — stable; v7's driver-adapter model was judged unnecessary complexity for this MVP) |
| Auth       | Supabase Auth |
| Storage    | Supabase Storage (wired in a later phase, once file uploads are needed) |
| Deployment | Vercel-compatible (Node.js runtime for Proxy; no Edge-only dependencies) |

Modular monolith, not microservices. At the target scale (hundreds of tenants,
thousands of stores/orders) a single Postgres instance with tenant-scoped rows and
proper indexes is sufficient; splitting into services later is an extraction, not a
rewrite, because business logic already lives in a `services/` layer, not in route
handlers or components.

## Folder structure

```
src/
  app/
    page.tsx                   # platform marketing site (root domain only)
    register/                  # merchant self-service signup
    api/auth/register/         # onboarding endpoint
    storefront/[tenant]/      # storefront tree — only reachable via proxy rewrite
    super-admin/                # completely separate admin area, role-gated
  components/ui/               # shadcn/ui primitives
  lib/
    env.ts                     # validated, typed environment access
    utils.ts                   # shadcn `cn()` helper
    client/                    # browser-only code (Supabase browser client)
    validators/                # Zod schemas — the client input boundary
    errors/                    # AppError + typed error codes
    server/
      db/client.ts             # Prisma singleton
      auth/                    # Supabase server client, RBAC guards
      tenant/                  # hostname parsing, TenantContext/resolver
      features/                # FeatureService (single source of truth)
      repositories/            # tenant-scoped data access (incl. theme-repository.ts)
      services/                # business logic: TenantService, theme-admin-service.ts
                                # (Super Admin, global theme mutations), tenant-theme-service.ts
                                # (tenant install/activate/customize), ...
      audit/                   # AuditLogService
  proxy.ts                     # hostname -> tenant resolution (Next.js "Proxy", formerly middleware)
prisma/
  schema.prisma                # foundation schema (see below)
  seed.ts                      # plans + features reference data
tests/                         # Vitest unit tests for the security-critical paths
```

Business logic lives in `lib/server/services/*`, never in a page component or a
route handler body — route handlers call a service and translate its result/errors
into an HTTP response.

## Tenant isolation

Enforced at four independent layers, so no single mistake creates a cross-tenant
leak:

1. **Database** — every tenant-owned table (`Tenant`, `TenantUser`, `Domain`,
   `TenantFeature`, `Subscription`, `StoreSettings`, `ThemeSettings`, ...) carries a
   required `tenantId` foreign key with an index.
2. **Repository** (`lib/server/repositories/*`) — functions take an already-resolved
   `tenantId` as an argument and use it in every `where` clause. There is no
   repository function that queries tenant-owned data without one.
3. **TenantContext** (`lib/server/tenant/tenant-context.ts`) — the single place a
   request's tenant is determined. It reads `x-tenant-slug`, a header set
   exclusively by `proxy.ts` from the verified `Host` header — never from a query
   param, form field, or JSON body. `resolveTenantContext()` looks the tenant up by
   that trusted slug; `requireActiveTenantContext()` additionally rejects
   suspended/cancelled tenants.
4. **API / RBAC** (`lib/server/auth/require-role.ts`) — `requireTenantRole(tenantId,
   roles)` re-derives the caller's tenant membership from the database by
   `(tenantId, userId)`, so a user who owns Tenant A gets `FORBIDDEN` when a request
   is scoped to Tenant B, regardless of what the client claims.

`registerMerchantSchema` (and every other Zod input schema) intentionally has no
`tenantId` field — there's no way for a client payload to even carry one.

## Subdomain resolution

`src/proxy.ts` runs on every request (Node.js runtime, the default for Proxy in
this Next.js version):

```
Host header
  -> parseHost(host, PLATFORM_ROOT_DOMAIN)   // pure, unit-tested
  -> subdomain label, or "root domain", or "unrelated host"
  -> if it's a genuine tenant subdomain (not reserved, not a platform path):
       - set x-tenant-slug header (after stripping any client-supplied value)
       - rewrite the request into /storefront/<slug>/...
  -> otherwise: pass through unchanged (marketing site / super-admin / API)
```

`myplatform.com` and `www.myplatform.com` both serve the marketing site.
`rahim.myplatform.com` and `karim.myplatform.com` each rewrite into
`/storefront/rahim/...` / `/storefront/karim/...`, carrying the trusted slug in the header.
`TenantLayout` (`app/storefront/[tenant]/layout.tsx`) then calls
`resolveTenantContext()`, which does the actual DB lookup and status check — Proxy
itself never touches the database, keeping it fast and edge/Node-runtime friendly.

> **Phase 3 correction**: this segment was originally named `_sites` (Phase 1/2).
> Next.js treats any folder prefixed with `_` as a **private folder**, excluded
> from routing entirely — every tenant storefront request was silently 404'ing.
> This was only caught in Phase 3 by actually inspecting the production build's
> route table (`/_sites/...` never appeared in it). Renamed to `storefront`
> (no leading underscore) and added a regression test
> (`tests/proxy.test.ts`) asserting the rewrite target actually resolves.
> Lesson: `next build`'s printed route list is worth checking after any
> app-tree rename.

No per-merchant DNS record is created. A single wildcard DNS entry
(`*.myplatform.com`) points at the app; the resolver above does the rest.

### Custom domains (prepared, not fully implemented)

The `Domain` model already supports both `SUBDOMAIN` and `CUSTOM` types, with
`verificationStatus`, `isPrimary`, and `sslStatus` fields. The intended flow for a
later phase:

```
www.rahimfashion.com  ->  DNS CNAME to the platform
                       ->  Proxy looks up Domain.hostname == "www.rahimfashion.com"
                       ->  found + VERIFIED -> resolves to the Rahim Fashion tenant
                       ->  not found / not verified -> fall through to a
                           "domain not configured" response, never a 500
```

`findTenantByDomainHostname` in the tenant repository already implements the
lookup half of this; wiring it into Proxy and building the verification workflow
(DNS TXT challenge, SSL provisioning) is Phase 13 work, intentionally deferred.

## Feature flags

Single source of truth: `lib/server/features/feature-service.ts`.

```
effective(tenant, featureKey) =
  TenantFeature.enabled   (if a TenantFeature row exists for this tenant+feature)
  ?? PlanFeature.enabled  (the tenant's plan's default for this feature)
  ?? false                (unknown/inactive feature)
```

`getEffectiveFeatures` returns the whole resolved map (used to render UI without
N+1 lookups); `isFeatureEnabled` and `requireFeature` check one key.
`requireFeature` throws `AppError("FEATURE_DISABLED", ...)`, which route handlers
and server actions turn into a 403 — the same function that decides whether to
show a UI element also decides whether to allow the request, so disabling a
feature can't be worked around by hitting the API or a direct URL.

## Theme Library

A core, platform-owned capability, not a later add-on: merchants never upload
theme code. Only `SUPER_ADMIN` creates, publishes, and manages themes; tenants
browse, preview, install, activate, and customize within a controlled contract.

### Roles and workflow

```
Lovable (design)
  -> Super Admin creates Theme (DRAFT) + a ThemeVersion carrying the Theme Contract
  -> Super Admin publishes the ThemeVersion  ->  Theme.status = PUBLISHED
  -> Published theme appears in eligible merchants' Theme Library automatically
       (eligibility = visibility rules, resolved live — no fan-out write needed)
  -> Merchant previews  ->  installs (TenantTheme.status = INSTALLED)
  -> Merchant activates, a separate action  ->  Tenant.activeTenantThemeId set
  -> Theme is live on that merchant's storefront
```

Installing never activates — matching the requirement that these are distinct,
explicit merchant actions. `theme-admin-service.ts` (Super Admin, global
mutations) and `tenant-theme-service.ts` (tenant actions) are separate modules
so the two authorization boundaries can never blur: nothing in
`tenant-theme-service.ts` writes to `Theme` or `ThemeVersion`.

### Models

- **`Theme`** — global platform entity: name, slug, category, thumbnail,
  `status` (`DRAFT | PUBLISHED | UNPUBLISHED | ARCHIVED`), `accessType`
  (`FREE | PREMIUM`, informational), `visibilityType`
  (`ALL | SELECTED_PLANS | SELECTED_TENANTS`, the actual eligibility gate).
- **`ThemeVersion`** — global, **immutable once `PUBLISHED`**. Publishing
  `Fashion Pro v1.1.0` creates a new row; it never overwrites `v1.0.0`, so a
  merchant already on `v1.0.0` is not silently broken (`THEME_VERSION_IMMUTABLE`
  is thrown if code ever tries to republish a published version). Carries the
  Theme Contract as validated `Json` (see below).
- **`ThemeAsset`** — global, storage pointers (package/preview/image/font) tied
  to a `ThemeVersion`.
- **`ThemePlanVisibility`** / **`ThemeTenantVisibility`** — join tables backing
  `SELECTED_PLANS` / `SELECTED_TENANTS` visibility.
- **`TenantTheme`** — the tenant-owned install record: `tenantId`, `themeId`,
  `themeVersionId`, `status` (`INSTALLED | ACTIVE`). Unique on
  `(tenantId, themeId)` — one install slot per theme per tenant; updating to a
  new published version reassigns `themeVersionId` on the same row rather than
  creating a duplicate, so `TenantThemeSettings` (keyed off `TenantTheme.id`)
  survives an update.
- **`TenantThemeSettings`** — tenant-owned customization (logo, colors,
  typography, header/footer, homepage sections, banners, social links, contact
  info, product display settings) layered on top of an installed theme. Never
  touches the global `Theme`/`ThemeVersion` row it customizes.
- **`Tenant.activeTenantThemeId`** — the authoritative "which theme is live"
  pointer (nullable FK to `TenantTheme`). `TenantTheme.status = ACTIVE` is a
  convenience label kept in sync with it by `TenantThemeService.activateTheme`,
  not a second source of truth — Postgres/Prisma can't express "at most one
  ACTIVE row per tenant" as a plain unique index, so this is enforced in the
  service, not the schema.

### The Theme Contract (why an uploaded theme can't gain server access)

A theme is **data and configuration, not executable application code**. What
Super Admin actually saves into `ThemeVersion.contract` is validated by
`themeContractSchema` (`src/lib/validators/theme.ts`) against a fixed shape:
`metadata`, `supportedPages`, `components`, `sections`, `configurableSettings`,
`designTokens`. The platform's own storefront renderer (built when Phase 8/9
land) is the only thing that ever interprets this contract against real tenant
data — a theme package can describe presentation and expose configurable
settings, but it cannot execute arbitrary code with server privileges. This is
the deliberate boundary that makes "design in Lovable, upload the export" safe:
the upload produces a contract-shaped package, not a deployable app.

### Feature flag integration

Every tenant-facing theme action starts with the same `FeatureService` gate
used everywhere else: `requireFeature(tenantId, planId, "theme_library")`.
Disabling `theme_library` for a tenant (via `TenantFeature` override or by
omitting it from their plan) hides the Theme Library UI, blocks
`installTheme`/`activateTheme`/settings updates, and returns `FEATURE_DISABLED`
on direct API access — one function, one decision, same as every other feature.

`accessType: PREMIUM` on a theme is a label for the UI; actual access control
runs through `visibilityType` (`ALL` / `SELECTED_PLANS` / `SELECTED_TENANTS`),
checked by `isThemeEligibleForTenant()` before install. A theme that is
`PREMIUM` + `SELECTED_PLANS: [pro, business]` is exactly "Fashion Pro,
Premium, available on Pro and Business" from the spec.

### Storage

Theme packages/assets live in object storage (Supabase Storage), separate from
tenant data: `platform-themes/<theme-slug>/<version>/{package,assets,preview}`.
`ThemeVersion.packagePath` / `ThemeAsset.storagePath` store the object path;
the app never executes an uploaded package server-side, only reads it through
the Theme Contract.

### Rendering (conceptual — storefront renderer is a later phase)

```
Request -> Proxy/TenantResolver -> TenantContext
  -> Tenant.activeTenantThemeId -> TenantTheme -> ThemeVersion (contract)
  -> TenantThemeSettings (this tenant's customization)
  -> Products/Categories/Store data (Phase 9+)
  -> Render storefront
```

The theme controls presentation; the tenant owns its business data. Nothing in
this chain lets a theme change write to another tenant's rows, and switching
themes never deletes products, categories, orders, customers, inventory,
coupons, or reviews — theme installs/activation only ever touch
`TenantTheme` / `TenantThemeSettings` / `Tenant.activeTenantThemeId`.

## Theme Runtime & Storefront (Phase 3)

Phase 1/2 built the Theme Library's data model and management services.
Phase 3 makes it actually render a storefront.

### Rendering pipeline

`resolveStorefrontTheme(tenantId)` (`src/lib/server/storefront/theme-runtime.ts`)
is the concrete implementation of the pipeline above:

```
Tenant.activeTenantThemeId
  -> null?                          -> { status: "no_active_theme" }
  -> TenantTheme row missing?       -> { status: "theme_not_found" }   (data-integrity fallback)
  -> ThemeVersion.contract invalid? -> { status: "invalid_contract" }  (never a stack trace)
  -> otherwise                      -> { status: "ok", contract, tenantLayouts, cssVariables, ... }
```

It is wrapped in React's `cache()`, so the layout and every page under it can
each call it without adding extra database round trips per request (Phase 3's
performance requirement — storefront resolution must stay cheap at volume).

`src/app/storefront/[tenant]/layout.tsx` calls it once and renders the
matching state: the existing suspended/cancelled screen (Phase 1), a new
"Choose a theme to launch your store" screen for `no_active_theme`, and a
generic "this store is being set up" screen for the two data-integrity
states — never exposing which one occurred or any internal detail.
`generateMetadata()` in the same layout reads `StoreSettings` (metaTitle,
metaDescription, faviconUrl, ogImageUrl — the Phase 3 SEO foundation) with
safe fallbacks to the tenant name.

**Deliberately not re-checked at render time**: `ThemeVersion.status`.
Versions are immutable and are never unpublished individually — only
install/activate are gated on `PUBLISHED` (`tenant-theme-service.ts`).
Rendering always trusts whatever version `Tenant.activeTenantThemeId` points
to, so a later platform-side theme change can never break an already-active
storefront ("preserve the currently active version").

### The Theme Contract, concretely

`themeContractSchema` (`src/lib/validators/theme.ts`) now includes
`defaultLayouts: Record<pageKey, SectionInstance[]>` — the theme's own
default section arrangement per page (`global` for header/footer chrome,
`home`, `product`, `category`, `cart`). A `SectionInstance` is just
`{ component: string; props: Record<string, unknown> }`. This is the entire
surface a theme package can use to describe a page — never a script, never
arbitrary markup.

### Controlled component registry

`src/lib/storefront/component-registry.tsx` maps a fixed set of approved
platform-built components (`Hero`, `Header`, `Footer`, `ProductGrid`,
`CategoryGrid`, `Banner`, `Testimonials`, `FAQ`, `Newsletter`) by name.
`renderSection()` looks a `SectionInstance.component` value up in this map;
an unrecognized name (an uploaded theme referencing something it shouldn't,
or a corrupted settings blob) renders **nothing** — never throws, never
evaluates the requested name as code. This is the actual enforcement of "a
theme can only request an approved component" — Zod validates shape, the
registry lookup is what makes the name safe to use.

### Design tokens

`src/lib/storefront/design-tokens.ts` turns a theme's `designTokens`
(`colors`, `fonts`, `spacing`, `radius`, `buttons`, `cards` — the fixed
category list, `DESIGN_TOKEN_CATEGORIES`) into CSS custom properties
(`--colors-primary`, etc.) applied via a React inline `style` object on the
storefront root — never a hand-built `<style>` string, so a value can't
"break out" into a second declaration the way string-concatenated CSS
could. `mergeDesignTokens()` layers a tenant's `TenantThemeSettings.settings.designTokens`
on top of the theme's own values, restricted to the same fixed categories —
a tenant can override a *value*, never introduce a new CSS variable name.
Every value additionally passes `sanitizeTokenValue()` (an allowlist regex
plus a `javascript:`/`<`/`>`/`expression(` denylist) before it's used; a
value that fails is dropped, not substituted with something unsafe.

### Tenant layout overrides

`resolveSectionsForPage(resolution, pageKey)` picks
`TenantThemeSettings.settings.layouts[pageKey]` if the tenant has set one for
that page, else falls back to `contract.defaultLayouts[pageKey]`, else an
empty list — an empty page body is a safe, valid state, never a crash. The
`layouts` and `designTokens` sub-fields of `TenantThemeSettings.settings` are
now validated by `tenantThemeSettingsShapeSchema`; everything else in that
JSON blob (logo URL, social links, contact info, banner images) stays
loosely typed, because it's only ever displayed as plain text/props by
trusted components — never parsed as CSS or executed.

### Preview

Two preview surfaces, both read-only — neither ever changes
`Tenant.activeTenantThemeId`:

- **Super Admin** (`/super-admin/themes/[themeId]/preview`,
  `getSuperAdminThemePreview`): any theme, any status, any version — this is
  pre-publish QA, gated only by `requireSuperAdmin()`.
- **Merchant** (`/dashboard/appearance/themes/[themeId]/preview`,
  `getMerchantThemePreview`): gated by `requireFeature("theme_library")`,
  then eligible-for-this-tenant (`isThemeEligibleForTenant`, the same check
  `installTheme` uses) **or** already installed by this tenant — so a
  merchant can still preview something they installed earlier even if
  platform visibility narrowed since. Only `PUBLISHED` versions are
  previewable this way. If the tenant has this exact version installed, the
  preview uses their real `TenantThemeSettings`; the install lookup is
  scoped to `(tenantId, themeId)`, so there is no path from one tenant's
  preview request to another tenant's settings.

Both call the same `buildPreviewRendering()` internally, which both preview
pages render through the shared `<PreviewFrame>` component — the same
`<StorefrontChrome>`/`<SectionList>` the live storefront uses, so "preview"
and "live" are guaranteed to render identically for the same inputs.

### Feature flag: Theme Library management vs. an already-active storefront

`theme_library` disabled for a tenant blocks **browsing, installing,
activating, and previewing** (`listEligibleThemes`, `installTheme`,
`activateTheme`, `getMerchantThemePreview` all call `requireFeature`
first) — the Appearance/Theme Library nav items disappear and the
corresponding APIs return `FEATURE_DISABLED`, matching every other feature
in the platform.

It does **not** affect `resolveStorefrontTheme()` — an already-active
storefront keeps rendering with whatever theme is currently activated even
if `theme_library` is later disabled for that tenant. Disabling the feature
means "this merchant can't manage themes right now," not "take their store
offline." These are two different code paths on purpose; conflating them
would mean a routine feature-flag change could break a live storefront.

## Catalog: Products & Categories (Phase 4)

### Architecture

`Product` and `Category` are tenant-owned tables, following the same rules
as everything else: `tenantId` required and indexed, every repository
function tenant-scoped, every write derives `tenantId` from `TenantContext`
(dashboard side) — never from client input. `catalog-repository.ts` splits
cleanly into two halves:

- **Merchant dashboard** (`listProductsForTenant`, `findProductById`, ...):
  full fields, any status, always scoped by `(tenantId, id)`.
- **Public storefront** (`listActiveProductsForStorefront`,
  `findActiveProductBySlugForStorefront`, ...): hard-filters
  `status: "ACTIVE"` in the query itself (not filtered after the fact) and
  uses an explicit Prisma `select` (`PUBLIC_PRODUCT_SELECT`/
  `PUBLIC_CATEGORY_SELECT`) that never includes `tenantId`, `status`,
  `createdAt`, or `updatedAt` — a field can't leak to a public page just
  because it got added to the model later.

`ProductService`/`CategoryService` (`lib/server/services/*`) sit in front of
the repository for merchant mutations: they call `requireFeature(...,
"product_catalog")` first, validate tenant-scoped slug/SKU uniqueness,
verify category ownership, and audit-log every mutation. Nothing in
`storefront-catalog-service.ts` (the public read path) can write anything.

### Tenant-scoped uniqueness (slugs, SKUs)

Two different merchants can both sell `/products/premium-shirt` or both use
SKU `SHIRT-001` — uniqueness for both is `(tenantId, slug)` /
`(tenantId, sku)`, enforced as **real Postgres unique constraints**
(`@@unique([tenantId, slug])`, `@@unique([tenantId, sku])` on `Product`;
`@@unique([tenantId, slug])` on `Category`), not just an application check.
`sku` is optional (**decision**: most Bangladesh SME merchants in the
target market don't have a formal SKU system on day one; requiring one
would be onboarding friction with no MVP benefit) — Postgres treats
multiple `NULL`s as distinct under a standard unique index, so any number of
skuless products coexist per tenant, and the constraint only activates once
a merchant actually sets one. `generateUniqueProductSlug`/
`generateUniqueCategorySlug` mirror `TenantService.generateUniqueSlug`'s
collision strategy (`premium-shirt` → `premium-shirt-2` → ...), scoped to
the tenant instead of global.

### Product ↔ Category relationship

Many-to-many via an explicit `ProductCategory` join table (not Prisma's
implicit join table — that can't carry extra columns, and this one needs
to). The interesting part: `ProductCategory.tenantId` is denormalized onto
the join row and used in **both** of its compound foreign keys —
`(tenantId, productId) -> Product(tenantId, id)` and
`(tenantId, categoryId) -> Category(tenantId, id)`. Because both foreign
keys reference the *same* `tenantId` column value, Postgres itself refuses
to insert a `ProductCategory` row unless the product and category it links
both belong to that exact tenant — this is a database constraint, not an
application-level check that could be forgotten in a new code path.
`ProductService` additionally verifies category ownership before insert
(defense in depth), but the DB constraint is the actual backstop.

### Product lifecycle

`CatalogStatus` (`DRAFT | ACTIVE | ARCHIVED`) is shared by Product and
Category — same lifecycle, same meaning: only `ACTIVE` is ever visible on
the storefront (enforced in the query, see above); `DRAFT` is
work-in-progress; `ARCHIVED` is soft-deleted (no permanent delete exists —
archiving is reversible by re-activating, and existing
`ProductCategory`/`ProductImage` rows are preserved). `product.activated`/
`product.archived`/`category.activated`/`category.archived` audit events
record every transition.

### Public catalog security

The public storefront never sees: `tenantId`, `status` (it's implied
`ACTIVE`), `createdAt`/`updatedAt`, or any DRAFT/ARCHIVED row (the query
itself excludes them — there's no "hide it in the UI" step to forget).
`storefront-catalog-service.ts`'s `PublicProductCard`/`PublicProductDetail`/
`PublicCategoryCard` types are hand-declared, not "whatever Prisma
returns," specifically so a future field added to `Product`/`Category`
doesn't silently become public just by existing.

### Theme → Catalog data flow

The Theme Contract can request a `ProductGrid` or `CategoryGrid` section
and suggest cosmetic props (`heading`, `limit`, `featuredOnly`) — it can
**never** supply its own `items` array or run its own query.
`hydrateCatalogSections()` (`src/lib/storefront/catalog-hydration.ts`) is
the enforcement point: every storefront page resolves its section list from
the theme/tenant layout as before, then passes it through
`hydrateCatalogSections()`, which overwrites `items` on any `ProductGrid`/
`CategoryGrid` section with a real result from `getStorefrontProducts()`/
`getStorefrontCategories()` (tenant-scoped, ACTIVE-only, safe projection).
Any `items` a theme or tenant settings blob tried to supply is discarded,
not merged. `ProductGrid`/`CategoryGrid` in the component registry are
purely presentational — they render whatever `items` they're given; they
never fetch anything themselves.

```
Theme Contract: { component: "ProductGrid", props: { heading: "New In" } }
  -> hydrateCatalogSections(sections, { tenantId })
  -> getStorefrontProducts(tenantId, { featuredOnly, categorySlug })
  -> { component: "ProductGrid", props: { heading: "New In", items: [...] } }
  -> renderSection() -> <ProductGrid props={...} />
```

### Pagination

Merchant dashboard product/category lists use **offset pagination**
(`page`/`pageSize` query params, `skip`/`take` in Prisma, capped at
`pageSize <= 100`). Chosen for simplicity at the expected scale — a
single-tenant catalog in the hundreds-to-low-thousands range, well within
what an indexed `(tenantId, status)`/`(tenantId, createdAt)` offset query
handles cheaply. Cursor-based pagination is a documented future
improvement if a merchant's catalog grows large enough for offset scan cost
to matter; not implemented in Phase 4 to avoid solving a problem the
platform doesn't have yet.

### Search

Basic `ILIKE`-style search (Prisma `contains` + `mode: "insensitive"`) over
`Product.name` and `Product.sku`, applied inside the same tenant-scoped
`listProductsForTenant` query — no separate search index or external
service. Sufficient for MVP catalog sizes; Elasticsearch/Algolia are
explicitly out of scope until catalog size or query complexity actually
requires them.

### Performance

Indexes added: `Product` on `tenantId`, `(tenantId, status)`, `createdAt`,
plus the unique indexes on `(tenantId, slug)` and `(tenantId, sku)` (which
also serve as lookup indexes); `Category` on `tenantId`, `(tenantId,
status)`, `sortOrder`, plus the unique index on `(tenantId, slug)`;
`ProductCategory` on `productId`, `categoryId`, and `tenantId`. No
speculative indexes beyond what the actual query patterns above use.

## Subscription & tenant status

`Tenant.status` and `Subscription.status` share the same state space
(`TRIAL | ACTIVE | PAST_DUE | GRACE_PERIOD | SUSPENDED | CANCELLED`).
`tenant-admin-service.ts` centralizes every status change through
`setTenantStatus()`, which:

- validates the transition against an explicit allow-list (`CANCELLED` is
  terminal; `SUSPENDED` can only reactivate to `ACTIVE` or move to `CANCELLED`;
  etc.),
- updates *only* the `status` column — suspension never touches products, orders,
  customers, or any other tenant data,
- always writes an `AuditLog` entry with the actor, the tenant, and the
  before/after status.

`requireActiveTenantContext()` is the single gate storefront/API code calls to
enforce "suspended tenants cannot serve traffic" — it throws `TENANT_SUSPENDED`
for both `SUSPENDED` and `CANCELLED` tenants, which `TenantLayout` renders as a
"store unavailable" page rather than exposing a 500 or leaking data.

Per-tenant billing (`Subscription.monthlyFee` can differ from
`Plan.defaultMonthlyFee`) is modeled from day one, so Super Admin can charge Rahim
৳1,000/mo and Karim ৳1,500/mo on the same Basic plan.

## Authentication & RBAC

- Supabase Auth issues the session (httpOnly cookies via `@supabase/ssr`); the
  service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is used only in
  `createSupabaseServiceRoleClient()`, a server-only function, and is never
  referenced from any file under `lib/client/` or from a Client Component.
- `requireUser()` resolves the Supabase session into the app's `User` row and
  throws `UNAUTHORIZED` if there is none — used in API routes/Server Actions,
  where an `AppError` → JSON response is the right shape. `getOptionalUser()`
  is the same resolution without the throw, for Server Components/layouts
  where the right response to "no session" is a clean `redirect()`, not an
  error boundary. Both also surface `emailConfirmedAt` straight from the
  Supabase session (not duplicated into our own `User` table), and
  `requireVerifiedUser()` layers the confirmation check on top.
- **Registration flow**: `POST /api/auth/register` only creates the
  unconfirmed Supabase auth user (via `signUp`, not the admin API — this
  triggers Supabase's normal verification email) and stashes the desired
  store name in `user_metadata.pending_store_name`. Tenant provisioning
  (`TenantService.provisionTenantForNewMerchant` — tenant, `TenantUser`
  as `TENANT_OWNER`, default plan, trial subscription, store/theme settings)
  happens in `/auth/callback` **after** the user actually clicks the
  verification link, not at signup time — no tenant is ever created for an
  unconfirmed account.
- **`/auth/callback`** is the single landing point for every Supabase email
  link (signup confirmation and password recovery both exchange a `code`
  here). It validates its `next` redirect target against a
  same-origin-relative-path check so it can't become an open redirect.
- **Login** (`POST /api/auth/login`) runs server-side so the session cookie
  lands on that response and the redirect target (`/super-admin` for
  `SUPER_ADMIN`, `/dashboard` otherwise) and the `auth.login` audit entry are
  both computed in one place. The redirect is deliberately coarse — it picks
  the right *area*; each area's own layout (e.g.
  `resolveDashboardAccessDecision`) does the fine-grained
  verified/suspended/no-store checks, so that logic isn't duplicated between
  login and the page itself.
- `requireSuperAdmin()` checks `User.globalRole === "SUPER_ADMIN"` — a global
  role, independent of tenant membership — and audit-logs every denial as
  `access.denied.super_admin`.
- `requireTenantRole(tenantId, allowedRoles)` looks up `TenantUser` by
  `(tenantId, userId)` and checks the role there. Because the lookup is keyed by
  the *target* tenant id (from `TenantContext`, never from the client), a user
  cannot use their `TENANT_OWNER` role on Tenant A to act on Tenant B.

### Multi-tenant membership and tenant switching

A user is not assumed to belong to exactly one tenant. The merchant dashboard
(`/dashboard`, `/dashboard/appearance`, ...) lives on the root domain, not a
tenant subdomain (`src/proxy.ts` explicitly excludes these paths from the
subdomain → tenant rewrite), because which tenant it's showing is a per-user
choice, not something derivable from the hostname.

- **`resolveDashboardTenantContext(userId)`** (`lib/server/tenant/dashboard-tenant-context.ts`)
  is the dashboard's equivalent of the storefront's `TenantContext`. It reads
  an `active_tenant_id` cookie as a *hint*, but always re-verifies that hint
  against a real `TenantUser` row before trusting it — a stale or tampered
  cookie value can at worst fail to resolve (falls back to the user's first
  membership); it can never grant access to a tenant the user doesn't belong
  to.
- **`switchTenant(userId, tenantId)`** is the only place a tenant switch is
  honored. The requested `tenantId` is treated as intent, never as
  authorization — membership is re-checked here regardless of what the
  client claims (`switchTenantSchema`'s comment spells this out). A
  non-member's attempt is audit-logged as `access.denied.tenant_switch`.
- `POST /api/dashboard/switch-tenant` calls `switchTenant`, then sets
  `active_tenant_id` as an httpOnly cookie — only after membership has been
  verified, never before.

## Audit logging

`logAuditEvent()` (`lib/server/audit/audit-log-service.ts`) is called from
services, not from route handlers directly, so a privileged mutation can't ship
without producing an audit trail. `tenant-admin-service.setTenantStatus()`,
`tenant-service.provisionTenantForNewMerchant()`, every mutation in
`theme-admin-service.ts` (create/publish/unpublish/archive/visibility), and
every mutation in `tenant-theme-service.ts` (install/activate/settings) all
call it today; every future privileged action (plan changes, impersonation)
should follow the same pattern — call the audit log from inside the service function
that performs the mutation.

## Database schema (Phase 1 foundation)

`prisma/schema.prisma` defines only what Phase 1 needs:

- **Identity**: `User`, `Tenant`, `TenantUser` (role join table)
- **Domains**: `Domain` (subdomain + custom, verification status, primary flag)
- **Plans/Features**: `Plan`, `Feature`, `PlanFeature`, `TenantFeature`
- **Billing**: `Subscription`, `Payment`, `Invoice`
- **Store config**: `StoreSettings` (now including the Phase 3 SEO fields
  `metaTitle`, `metaDescription`, `faviconUrl`, `ogImageUrl`, all optional),
  `ThemeSettings` (legacy minimal stub; see Theme Library below for the real
  theming system)
- **Theme Library**: `Theme`, `ThemeVersion`, `ThemeAsset`,
  `ThemePlanVisibility`, `ThemeTenantVisibility`, `TenantTheme`,
  `TenantThemeSettings` — see the dedicated section above
- **Catalog (Phase 4)**: `Product`, `ProductImage`, `Category`,
  `ProductCategory` (many-to-many join, tenant-checked at the DB level) —
  see the dedicated section above
- **Governance**: `AuditLog`, `ImpersonationSession`, `Notification`

Order/cart/checkout/payment/inventory/courier tables are intentionally
**not** in Phase 4 — they arrive in later phases once the catalog
foundation has been validated. Phase 4 is price-only: no stock quantity,
warehouse, or supplier concept exists yet.

Every tenant-owned model has an indexed `tenantId`; `Tenant.slug` and
`Domain.hostname` are unique and indexed for the resolver's lookup path;
`AuditLog` is indexed on `tenantId`, `actorId`, `action`, and `createdAt` for the
Super Admin log views coming in a later phase.

## Security summary

- No `tenantId` is ever accepted from the client; it is always derived from the
  verified `Host` header (via Proxy) or an authenticated session's tenant
  membership.
- All input at the API boundary is validated with Zod; schemas never include a
  tenant-scoping field.
- The Supabase service-role key and any future payment/API secrets are read only
  in `lib/server/**`, never in `lib/client/**` or a `"use client"` file.
- `AppError` gives every failure mode a stable code
  (`TENANT_NOT_FOUND`, `TENANT_SUSPENDED`, `FEATURE_DISABLED`,
  `SUBSCRIPTION_EXPIRED`, `UNAUTHORIZED`, `FORBIDDEN`, `DOMAIN_NOT_VERIFIED`,
  `SLUG_ALREADY_EXISTS`, `VALIDATION_ERROR`, `NOT_FOUND`, `THEME_NOT_FOUND`,
  `THEME_VERSION_NOT_FOUND`, `THEME_VERSION_IMMUTABLE`, `THEME_NOT_ELIGIBLE`,
  `THEME_NOT_INSTALLED`, `PRODUCT_NOT_FOUND`, `CATEGORY_NOT_FOUND`,
  `SKU_ALREADY_EXISTS`) and `toApiErrorResponse()` guarantees unexpected
  errors return a generic 500 message rather than leaking internals.
- Reserved subdomains (`www`, `api`, `admin`, `app`, `super-admin`, `static`,
  `assets`, `mail`, `ftp`) can never be claimed as a tenant slug
  (`generateUniqueSlug`) and are never rewritten into a tenant lookup by Proxy.
- Theme management (`create/publish/unpublish/archive/visibility`) only exists
  in `theme-admin-service.ts`, which is only ever called from Super
  Admin-guarded routes; tenant code paths (`tenant-theme-service.ts`) have no
  function that can write to `Theme` or `ThemeVersion`.
- Storefront error states never leak internals: `NO_ACTIVE_THEME`,
  `THEME_NOT_FOUND`, `INVALID_THEME_CONTRACT` (the last two are
  data-integrity fallbacks that should never normally trigger) all render
  the same generic "this store is being set up" screen — a customer never
  sees which failure mode occurred, a stack trace, or a database error.
  `TENANT_NOT_FOUND` renders Next's standard not-found page;
  `TENANT_SUSPENDED`/`TENANT_CANCELLED` render the existing "store
  unavailable" screen (Phase 1) without revealing why.
- Theme preview never activates a theme and never leaks another tenant's
  data: `getMerchantThemePreview`'s installed-settings lookup is scoped to
  `(tenantId, themeId)` from the *caller's own* tenant context (never a
  client-supplied tenantId), so there is no code path from previewing as
  Tenant A to seeing Tenant B's `TenantThemeSettings`.
- Design tokens and component names are the only parts of a theme/tenant
  settings blob that ever influence what renders — both go through a
  fixed-category/fixed-registry allowlist (`DESIGN_TOKEN_CATEGORIES`,
  `COMPONENT_REGISTRY`) plus value sanitization, so neither a malicious
  theme package nor a malicious tenant settings write can inject CSS,
  markup, or code into the storefront.
- Product/category slug and SKU uniqueness are tenant-scoped Postgres unique
  constraints (`(tenantId, slug)`, `(tenantId, sku)`), not just application
  checks — a duplicate within a tenant fails at the database even if a bug
  ever skipped the application-level `productSlugExists`/`skuExists` check.
- `ProductCategory`'s compound foreign keys (`(tenantId, productId) ->
  Product(tenantId, id)`, `(tenantId, categoryId) -> Category(tenantId,
  id)`) make a cross-tenant product/category association a constraint
  violation, not an application bug waiting to happen — Postgres refuses
  the insert outright.
- The public catalog (`storefront-catalog-service.ts`) never returns
  `tenantId`, `status`, or timestamp fields, and its underlying repository
  queries hard-filter `status: "ACTIVE"` — a DRAFT or ARCHIVED product's
  slug 404s on the storefront exactly like a nonexistent one, never
  revealing that an unpublished product exists.
- Theme JSON (contract `defaultLayouts` or a tenant's layout override) can
  never supply its own product/category data: `hydrateCatalogSections()`
  always overwrites a `ProductGrid`/`CategoryGrid` section's `items` with a
  real, tenant-scoped query result, discarding anything the theme/tenant
  settings tried to put there.
