import { resolveTenantContext } from "@/lib/server/tenant/tenant-context";
import { resolveStorefrontTheme, resolveSectionsForPage } from "@/lib/server/storefront/theme-runtime";
import { hydrateCatalogSections } from "@/lib/storefront/catalog-hydration";
import { SectionList } from "@/lib/storefront/storefront-renderer";

// The layout above has already handled every non-"ok" theme-resolution
// state (no theme / not found / invalid contract) and every non-active
// tenant status — reaching this page means there's a real theme to render.
// resolveStorefrontTheme is cache()-wrapped, so this second call doesn't
// cost a second database round trip.
export default async function StorefrontHome() {
  const ctx = await resolveTenantContext();
  if (!ctx) return null;

  const resolution = await resolveStorefrontTheme(ctx.id);
  if (resolution.status !== "ok") return null;

  const sections = await hydrateCatalogSections(resolveSectionsForPage(resolution, "home"), { tenantId: ctx.id });

  return <SectionList sections={sections} />;
}
