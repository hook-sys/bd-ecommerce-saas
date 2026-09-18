# Development Rules

Non-negotiable rules for this codebase. If a change requires breaking one of
these, stop and reconsider the design — these exist because breaking them
silently creates a cross-tenant data leak or a security hole, not because of
style preference.

1. **Never trust a client-supplied `tenantId`.** It is always derived
   server-side, either from `resolveTenantContext()` (backed by the verified
   `Host` header) or from an authenticated user's `TenantUser` row. Zod input
   schemas must never include a `tenantId` field for tenant-scoped mutations.

2. **Never query tenant-owned data without a tenant scope.** Every
   repository function for a tenant-owned model takes `tenantId` as a required
   argument and uses it in the `where` clause. If you add a new tenant-owned
   table, add its repository functions the same way — no "just this once"
   unscoped query.

3. **Never bypass `FeatureService`.** UI visibility, API authorization, and
   direct-URL access must all check the same `isFeatureEnabled` /
   `requireFeature` call. Don't hide a feature in the UI and assume that's
   enough — the API route or server action behind it must call
   `requireFeature` too.

4. **Never expose service-role or other server-only secrets to the
   client.** `SUPABASE_SERVICE_ROLE_KEY` and anything like it may only be read
   inside `src/lib/server/**`. If a value needs to reach the browser, it must
   be a `NEXT_PUBLIC_*` var and must not be a secret.

5. **Never change tenant or subscription status without an audit log
   entry.** Route every status transition through
   `tenant-admin-service.setTenantStatus()` (or an equivalent service function
   that itself calls `logAuditEvent`), not a direct `prisma.tenant.update()`
   from a route handler.

6. **Never let a merchant claim a reserved subdomain.** Check new reserved
   words in both `RESERVED_SUBDOMAINS` (`src/proxy.ts`) and
   `RESERVED_SLUGS`/`getReservedSlugs()` (`src/lib/env.ts` /
   `.env.example`) — they're intentionally duplicated (Proxy avoids importing
   the full env-validated config) and must be kept in sync.

7. **Never put business logic inside UI components or route handlers.**
   Route handlers/Server Actions parse input, call a `lib/server/services/*`
   function, and translate the result/`AppError` into a response. Components
   render; they don't decide what's allowed.

8. **Never delete tenant data on suspension or cancellation.** Status
   changes flip a flag; they must never cascade-delete or otherwise remove a
   tenant's rows. Data retention on suspension is a product requirement, not
   an implementation detail to optimize away.

9. **Never skip the `AppError` → typed error code path.** Throw `AppError`
   with one of the defined codes rather than a bare `Error` or an ad hoc HTTP
   response, so `toApiErrorResponse()` can map it consistently and avoid
   leaking internal error messages to the client.

10. **Never statically prerender a tenant- or auth-dependent route.** Any
    page/layout that calls `resolveTenantContext()`, `requireUser()`, or reads
    request headers/cookies must export `dynamic = "force-dynamic"` — Next
    will otherwise try to prerender it at build time with no request context
    and fail (or worse, cache a response across tenants).

11. **Run the full check suite before calling anything done.**
    `npm run typecheck && npm run lint && npm test && npm run build`. All
    four must pass clean — no ignored/known-failing errors.

12. **Only `theme-admin-service.ts` may write to `Theme` or `ThemeVersion`,
    and only behind a `requireSuperAdmin()` guard in the calling route.**
    Merchants never upload or modify platform themes — no function in
    `tenant-theme-service.ts` (or any tenant-facing route) may write to those
    tables, full stop. Tenant customization always goes into
    `TenantThemeSettings`, never into the global theme record it customizes.

13. **Never overwrite a published `ThemeVersion` in place.** Once
    `ThemeVersion.status` is `PUBLISHED`, it is immutable — a theme update is
    always a *new* `ThemeVersion` row (`publishThemeVersion` throws
    `THEME_VERSION_IMMUTABLE` if code tries to republish one). This is what
    keeps a merchant on `v1.0.0` from breaking when Super Admin ships
    `v1.1.0`.

14. **Theme installation/activation must never touch commerce data.**
    Installing, activating, or switching a tenant's theme may only write to
    `TenantTheme`, `TenantThemeSettings`, and `Tenant.activeTenantThemeId`. It
    must never delete or modify products, categories, orders, customers,
    inventory, coupons, or reviews.

15. **Theme Library actions must go through `FeatureService` like every
    other feature.** Gate tenant-facing theme actions with
    `requireFeature(tenantId, planId, "theme_library")` — don't add a
    theme-specific bypass. Additional per-theme eligibility
    (`visibilityType` / `SELECTED_PLANS` / `SELECTED_TENANTS`) is checked
    separately via `isThemeEligibleForTenant()`, on top of, not instead of,
    the feature flag check.

16. **A theme package is a validated contract, not executable code.**
    Anything saved into `ThemeVersion.contract` must pass
    `themeContractSchema` (`src/lib/validators/theme.ts`). Never add a path
    that lets an uploaded theme package run arbitrary server-side code —
    the platform owns the renderer; the theme only supplies
    presentation/configuration within the contract.

17. **A `tenantId` accepted as input (e.g. `switchTenantSchema`) is intent,
    never authorization.** The one place this pattern is allowed —
    tenant-switching — must re-verify real membership
    (`prisma.tenantUser.findUnique({ tenantId_userId: ... } })`) before
    honoring it. Never treat "the client asked for tenant X" as "the client
    may act on tenant X."

18. **Use `getOptionalUser()` in Server Components/layouts, `requireUser()`
    in API routes/Server Actions.** The former lets a route redirect
    cleanly (`redirect("/login")`); the latter throws `AppError` for
    `toApiErrorResponse()` to convert to JSON. Don't throw from a layout
    where a redirect is what the user should see, and don't silently
    swallow "no session" in a route handler that should return 401.

19. **Any redirect target taken from a request (e.g. `/auth/callback`'s
    `next` param) must be validated as a same-origin relative path before
    use.** Never pass an unvalidated `next`/`returnTo`/`redirect` value
    straight into a `Response.redirect` — that's an open-redirect
    vulnerability.

20. **Log every denied privileged-access attempt, not just successful
    privileged actions.** `requireSuperAdmin()` and `switchTenant()` both
    audit-log on denial (`access.denied.*`), not only on success — the
    denial itself is the security-relevant event.

21. **Never name an App Router segment with a leading underscore unless you
    intend it to be unroutable.** Next.js treats `_folderName` as a private
    folder and excludes it and all its children from routing entirely — this
    is what silently broke the storefront in Phase 1/2 (`_sites` never
    resolved to anything; see ARCHITECTURE.md's Theme Runtime section). After
    any `src/app/**` rename, check `next build`'s printed route table for
    the routes you expect, not just that the build succeeded.

22. **A theme (or a tenant's settings) can only ever affect *what* renders
    through two fixed allowlists: `COMPONENT_REGISTRY` and
    `DESIGN_TOKEN_CATEGORIES`.** Never add a code path that takes a string
    from `ThemeVersion.contract` or `TenantThemeSettings.settings` and uses
    it as a CSS property name, a raw `<style>` string, a dynamic
    `import()`/`require()`, or anything else that isn't a lookup into one of
    those two allowlists. An unrecognized component name must render
    nothing, never throw and never evaluate the name as code.

23. **`resolveStorefrontTheme()` must never re-validate
    `ThemeVersion.status` against the tenant's currently active version.**
    Only install/activate are gated on `PUBLISHED`. Re-checking at render
    time would mean a platform-side change to how versions are handled
    could break an already-live storefront — exactly what Phase 3's
    "preserve the currently active version" rule forbids.

24. **Disabling `theme_library` for a tenant must never affect
    `resolveStorefrontTheme()`.** It blocks Theme Library *management*
    (browse/install/activate/preview) — it must never be checked inside the
    live storefront rendering path. These are separate concerns on purpose;
    see ARCHITECTURE.md's "Theme Library management vs. an already-active
    storefront" note before changing either.

25. **Product and category slug/SKU uniqueness is tenant-scoped, never
    global.** `(tenantId, slug)` and `(tenantId, sku)`, both as real Postgres
    unique constraints. Two different merchants are allowed — expected — to
    both have `/products/premium-shirt` or both use SKU `SHIRT-001`. Never
    add a plain `@@unique([slug])` or `@@unique([sku])` to a catalog table.

26. **Any new tenant-owned join table must prevent cross-tenant
    association at the database level, not just in application code.**
    Follow `ProductCategory`'s pattern: denormalize `tenantId` onto the join
    row and use it in both compound foreign keys
    (`(tenantId, aId) -> A(tenantId, id)`, same for B). If a future join
    table can't do this, the service layer must verify both sides belong to
    the same tenant before every insert — but prefer the DB constraint.

27. **The public storefront catalog only ever returns hand-declared public
    shapes (`PublicProductCard`, etc.), never a raw Prisma model result.**
    When adding a field to `Product`/`Category`, it does not become visible
    to customers just by existing — it must be deliberately added to the
    public type and the repository's `select`. Default to leaving it out.

28. **A theme (or a tenant's layout override) can request a `ProductGrid`/
    `CategoryGrid` section and suggest cosmetic props, but must never be
    trusted to supply its own `items`.** Every storefront page must route
    its resolved sections through `hydrateCatalogSections()` before
    rendering — never render a `ProductGrid`/`CategoryGrid` section
    straight from `resolveSectionsForPage()`'s output.

29. **Only `ACTIVE` products/categories are ever reachable from the public
    storefront — enforced in the query (`status: "ACTIVE"` in the `where`
    clause), never as a post-fetch filter or a UI-only hide.** A DRAFT or
    ARCHIVED item's slug must 404 exactly like a nonexistent one; the
    response must never reveal that an unpublished item exists.
